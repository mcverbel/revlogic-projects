/**
 * Tracker connector for Claude (MCP, Streamable HTTP, JSON responses).
 * Auth: a personal token from the Connections page, sent as `Authorization: Bearer rlp_…`.
 * Every call is scoped to the person who owns the token.
 */
import { NextResponse } from "next/server";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, users, engagements, clients, tasks, suggestions, engagementSources, processedItems, connections, type SuggestionSource } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { sha256 } from "@/lib/crypto";
import { myWork } from "@/lib/queries";
import { journeyLabel, TASK_STATUSES } from "@/lib/constants";
import { logActivity } from "@/lib/activity";

const TOOLS = [
  {
    name: "my_tasks",
    description: "Tasks I own or am assigned to across revlogic engagements, ordered by my personal priority then due date.",
    inputSchema: { type: "object", properties: { filter: { type: "string", enum: ["all", "overdue", "this_week", "open"], default: "open" }, engagement: { type: "string", description: "Client or engagement name to narrow to" } } },
  },
  {
    name: "update_task",
    description: "Update one of my tasks: status, due date or my personal priority.",
    inputSchema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" }, status: { type: "string", enum: TASK_STATUSES.map((s) => s.id) }, due_date: { type: "string", description: "YYYY-MM-DD" }, my_priority: { type: "string", enum: ["", "low", "medium", "high", "top"] } } },
  },
  {
    name: "create_task",
    description: "Add a task to an engagement (owner defaults to me).",
    inputSchema: { type: "object", required: ["engagement", "title"], properties: { engagement: { type: "string", description: "Client or engagement name" }, title: { type: "string" }, due_date: { type: "string" } } },
  },
  {
    name: "engagement_summary",
    description: "Journey stage, open tasks, overdue items and pending suggested tasks for one engagement.",
    inputSchema: { type: "object", required: ["engagement"], properties: { engagement: { type: "string" } } },
  },
  {
    name: "engagements_to_sync",
    description: "Engagements with a linked Aurasell account, plus Aurasell meeting ids already processed. Use before reading new Aurasell meetings for suggested tasks.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_suggestions",
    description: "Send suggested tasks found in one source item (an Aurasell meeting, email or Slack thread) to an engagement's Suggested tab. Each item is processed once; repeats are ignored. Owners must be revlogic emails. Only include due_date if a date was actually said.",
    inputSchema: {
      type: "object", required: ["engagement_id", "source", "suggestions"],
      properties: {
        engagement_id: { type: "string" },
        source: { type: "object", required: ["provider", "external_id", "title"], properties: { provider: { type: "string", enum: ["aurasell", "gmail", "slack", "otter"] }, external_id: { type: "string", description: "Aurasell meeting id, email id, etc." }, title: { type: "string" }, url: { type: "string" } } },
        suggestions: { type: "array", items: { type: "object", required: ["title", "kind", "quote"], properties: {
          title: { type: "string" }, kind: { type: "string", enum: ["task", "waiting_on_client", "milestone_estimate"] },
          owner_emails: { type: "array", items: { type: "string" } }, external_owner: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" }, due_text: { type: "string" },
          quote: { type: "string" }, speaker: { type: "string" }, at: { type: "string", description: "mm:ss in the call" },
        } } },
      },
    },
  },
];

async function findEngagement(q: string) {
  const rows = await db.select({ e: engagements, c: clients }).from(engagements).innerJoin(clients, eq(clients.id, engagements.clientId)).where(isNull(engagements.archivedAt));
  const n = q.toLowerCase();
  return rows.find((r) => r.c.name.toLowerCase().includes(n) || r.e.name.toLowerCase().includes(n)) ?? null;
}

async function runTool(userId: string, name: string, args: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  if (name === "my_tasks") {
    let rows = await myWork(userId);
    const f = args.filter ?? "open";
    if (f !== "all") rows = rows.filter((r) => r.t.status !== "done");
    if (f === "overdue") rows = rows.filter((r) => r.t.dueDate && r.t.dueDate < today);
    if (f === "this_week") rows = rows.filter((r) => r.t.dueDate && r.t.dueDate <= week);
    if (args.engagement) rows = rows.filter((r) => `${r.client.name} ${r.e.name}`.toLowerCase().includes(args.engagement!.toLowerCase()));
    return rows.map((r) => ({ task_id: r.t.id, title: r.t.title, engagement: `${r.client.name} · ${r.e.name}`, status: r.t.status, due_date: r.t.dueDate, my_priority: r.myPriority ?? "" }));
  }
  if (name === "update_task") {
    const t = await db.query.tasks.findFirst({ where: eq(tasks.id, args.task_id!) });
    if (!t) throw new Error("Task not found");
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (args.status) { set.status = args.status; set.completedAt = args.status === "done" ? new Date() : null; }
    if (args.due_date) set.dueDate = args.due_date;
    if (Object.keys(set).length > 1) await db.update(tasks).set(set).where(eq(tasks.id, t.id));
    if (args.my_priority !== undefined) {
      const { userTaskPrefs } = await import("@/db/schema");
      await db.insert(userTaskPrefs).values({ userId, taskId: t.id, myPriority: args.my_priority || null })
        .onConflictDoUpdate({ target: [userTaskPrefs.userId, userTaskPrefs.taskId], set: { myPriority: args.my_priority || null } });
    }
    await logActivity({ engagementId: t.engagementId, actorId: userId, entityType: "task", entityId: t.id, action: "updated", summary: `updated "${t.title}" from Claude` });
    return { ok: true };
  }
  if (name === "create_task") {
    const hit = await findEngagement(args.engagement!);
    if (!hit) throw new Error(`No engagement matches "${args.engagement}"`);
    const [t] = await db.insert(tasks).values({ engagementId: hit.e.id, title: args.title!, ownerId: userId, dueDate: args.due_date || null, startDate: args.due_date || null, createdBy: userId }).returning();
    await logActivity({ engagementId: hit.e.id, actorId: userId, entityType: "task", entityId: t!.id, action: "created", summary: `added task "${t!.title}" from Claude` });
    return { task_id: t!.id };
  }
  if (name === "engagement_summary") {
    const hit = await findEngagement(args.engagement!);
    if (!hit) throw new Error(`No engagement matches "${args.engagement}"`);
    const ts = await db.select().from(tasks).where(eq(tasks.engagementId, hit.e.id));
    const pend = await db.select().from(suggestions).where(and(eq(suggestions.engagementId, hit.e.id), eq(suggestions.status, "pending")));
    const open = ts.filter((t) => t.status !== "done");
    return {
      engagement: `${hit.c.name} · ${hit.e.name}`, stage: journeyLabel(hit.e.journeyStage), health: hit.e.health,
      open_tasks: open.length, overdue: open.filter((t) => t.dueDate && t.dueDate < today).map((t) => ({ title: t.title, due_date: t.dueDate })),
      next_milestone: open.filter((t) => t.isMilestone).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0]?.title ?? null,
      pending_suggestions: pend.map((p) => p.title),
    };
  }
  if (name === "engagements_to_sync") {
    // Record that the Aurasell sync ran (shown as the Aurasell status on Connections)
    const row = await db.query.connections.findFirst({ where: and(eq(connections.scope, "company"), eq(connections.provider, "aurasell_sync")) });
    if (row) await db.update(connections).set({ lastSyncedAt: new Date(), userId }).where(eq(connections.id, row.id));
    else await db.insert(connections).values({ scope: "company", provider: "aurasell_sync", userId, lastSyncedAt: new Date() });
    const rows = await db.select({ e: engagements, c: clients }).from(engagements).innerJoin(clients, eq(clients.id, engagements.clientId)).where(isNull(engagements.archivedAt));
    const src = await db.select().from(engagementSources).where(eq(engagementSources.kind, "aurasell_account"));
    const done = await db.select().from(processedItems).where(eq(processedItems.provider, "aurasell"));
    return rows.filter((r) => src.some((s) => s.engagementId === r.e.id)).map((r) => ({
      engagement_id: r.e.id, engagement: `${r.c.name} · ${r.e.name}`,
      aurasell_account_ids: src.filter((s) => s.engagementId === r.e.id).map((s) => s.value),
      aurasell_opportunity_id: r.e.aurasellOpportunityId,
      processed_meeting_ids: done.filter((d) => d.engagementId === r.e.id).map((d) => d.externalId),
    }));
  }
  if (name === "add_suggestions") {
    const a = args as unknown as { engagement_id: string; source: { provider: SuggestionSource["provider"]; external_id: string; title: string; url?: string }; suggestions: { title: string; kind: "task" | "waiting_on_client" | "milestone_estimate"; owner_emails?: string[]; external_owner?: string; due_date?: string; due_text?: string; quote: string; speaker?: string; at?: string }[] };
    const e = await db.query.engagements.findFirst({ where: eq(engagements.id, a.engagement_id) });
    if (!e) throw new Error("Unknown engagement_id");
    const already = await db.select().from(processedItems).where(and(eq(processedItems.engagementId, e.id), eq(processedItems.provider, a.source.provider), eq(processedItems.externalId, a.source.external_id)));
    if (already.length) return { skipped: "already processed" };
    const roster = await db.select().from(users);
    const pending = await db.select().from(suggestions).where(eq(suggestions.engagementId, e.id));
    const label = { aurasell: "Recording", gmail: "Email", slack: "Slack", otter: "Otter" }[a.source.provider];
    let created = 0;
    for (const s of a.suggestions ?? []) {
      const fingerprint = sha256(`${e.id}:${s.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`);
      const source: SuggestionSource = { provider: a.source.provider, url: a.source.url, quote: s.quote, speaker: s.speaker, at: s.at, externalId: a.source.external_id,
        label: [s.speaker, s.at, `${label} · ${a.source.title}`].filter(Boolean).join(" · ") };
      const dup = pending.find((p) => p.fingerprint === fingerprint);
      if (dup) { await db.update(suggestions).set({ sources: [...dup.sources, source] }).where(eq(suggestions.id, dup.id)); continue; }
      const ownerIds = (s.owner_emails ?? []).map((em) => roster.find((r) => r.email.toLowerCase() === em.toLowerCase())?.id).filter(Boolean) as string[];
      await db.insert(suggestions).values({ engagementId: e.id, title: s.title.slice(0, 300), kind: s.kind, ownerIds, externalOwner: s.external_owner ?? null,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(s.due_date ?? "") ? s.due_date! : null, dueText: s.due_text ?? null, sources: [source], fingerprint });
      created++;
    }
    await db.insert(processedItems).values({ provider: a.source.provider, externalId: a.source.external_id, engagementId: e.id }).onConflictDoNothing();
    await logActivity({ engagementId: e.id, actorId: userId, entityType: "suggestion", action: "created", summary: `Claude added ${created} suggested task${created === 1 ? "" : "s"} from ${label.toLowerCase()} "${a.source.title}"` });
    return { created };
  }
  throw new Error(`Unknown tool ${name}`);
}

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const row = token ? await db.query.apiTokens.findFirst({ where: eq(apiTokens.tokenHash, sha256(token)) }) : null;
  if (!row) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  const me = await db.query.users.findFirst({ where: eq(users.id, row.userId) });

  const msg = (await req.json()) as { id?: number | string; method: string; params?: { name?: string; arguments?: Record<string, unknown> } };
  const reply = (result: unknown) => NextResponse.json({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "revlogic-projects", version: "0.1.0" }, instructions: `Signed in as ${me?.name}. Tools work on revlogic engagements and this person's tasks.` });
    case "notifications/initialized":
      return new NextResponse(null, { status: 202 });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call":
      try {
        const out = await runTool(row.userId, msg.params?.name ?? "", (msg.params?.arguments ?? {}) as Record<string, any>);
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
      } catch (err) {
        return reply({ content: [{ type: "text", text: String((err as Error).message) }], isError: true });
      }
    default:
      return NextResponse.json({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } });
  }
}

export async function GET() {
  return new NextResponse("Method not allowed", { status: 405 });
}
