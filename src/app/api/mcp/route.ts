/**
 * Tracker connector for Claude (MCP, Streamable HTTP, JSON responses).
 * Auth: a personal token from the Connections page, sent as `Authorization: Bearer rlp_…`.
 * Every call is scoped to the person who owns the token.
 */
import { NextResponse } from "next/server";
import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, users, engagements, clients, tasks, suggestions, engagementSources, processedItems, connections, clientActivity, type SuggestionSource, type StoredEmail, type StoredMeeting, type StoredPerson } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { sha256 } from "@/lib/crypto";
import { myWork } from "@/lib/queries";
import { categoryOf, journeyLabel, TASK_STATUSES } from "@/lib/constants";
import { logActivity } from "@/lib/activity";
import { ensureClientActivityTable } from "@/lib/client-activity";
import { oauthLog, userForAccessToken } from "@/lib/oauth";
import { appUrl } from "@/lib/app-url";
import { importAsanaTasks, TEMP_TOKEN_HOURS, TEMP_TOKEN_LABEL } from "@/lib/asana-import";

const PERSON = { type: "object", properties: { name: { type: "string" }, email: { type: "string" } } };

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
    description: "Engagements to sync from Aurasell: their linked Aurasell account ids and/or the client's email domains (find the account with search_accounts by domain when no id is linked), plus Aurasell meeting ids already processed for suggested tasks. Use first, then add_suggestions for new recorded meetings and save_client_activity for every engagement.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "save_client_activity",
    description: "Save one engagement's client activity for its Overview tab, replacing what was saved before. Send meetings from the last 90 days and the next 60 days (not cancelled) and the latest client emails from the last 90 days (skip calendar invitations). Include Aurasell's summary and next steps only for the 3 most recent past meetings. Mark people as client: true when they are client contacts, false for revlogic people.",
    inputSchema: {
      type: "object", required: ["engagement_id", "meetings", "emails"],
      properties: {
        engagement_id: { type: "string" },
        account_name: { type: "string", description: "The Aurasell account name" },
        meetings: { type: "array", items: { type: "object", required: ["id", "title", "start"], properties: {
          id: { type: "string", description: "Aurasell meeting or message id" }, title: { type: "string" },
          start: { type: "string", description: "ISO date-time" }, end: { type: "string", description: "ISO date-time" },
          link: { type: "string", description: "Video call link, upcoming meetings only" },
          people: { type: "array", items: { type: "object", required: ["name", "client"], properties: { name: { type: "string" }, email: { type: "string" }, client: { type: "boolean" } } } },
          summary: { type: "string", description: "Aurasell summary plus next steps as '- ' lines" },
          has_recording: { type: "boolean" }, heat: { type: "string", enum: ["", "hot", "very_hot"] },
        } } },
        emails: { type: "array", items: { type: "object", required: ["id", "title", "at"], properties: {
          id: { type: "string" }, title: { type: "string", description: "Subject" }, at: { type: "string", description: "ISO date-time sent" },
          from: { type: "object", required: ["name", "client"], properties: { name: { type: "string" }, email: { type: "string" }, client: { type: "boolean" } } },
          to: { type: "array", items: { type: "object", required: ["name", "client"], properties: { name: { type: "string" }, email: { type: "string" }, client: { type: "boolean" } } } },
          snippet: { type: "string", description: "First line or two of the email, plain text" },
        } } },
      },
    },
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
  {
    name: "import_asana_completed_tasks",
    description: "One-time Asana migration into the Graphic Design board's Completed tab (board owner or admins only). Send completed Asana tasks, at most 50 per call. dry_run defaults to true and only reports what would happen; send dry_run: false to import. Tasks already imported are skipped, so repeating a call is safe. Never send open tasks.",
    inputSchema: {
      type: "object", required: ["tasks"],
      properties: {
        dry_run: { type: "boolean", default: true },
        tasks: { type: "array", maxItems: 50, items: { type: "object", required: ["asana_id", "title", "completed_at"], properties: {
          asana_id: { type: "string", description: "Asana task gid" }, title: { type: "string" },
          completed_at: { type: "string", description: "ISO date-time" }, due_date: { type: "string", description: "YYYY-MM-DD" },
          assignee: PERSON, requester: { ...PERSON, description: "Who asked for it: a Requester field if the task has one, otherwise the task's creator" },
          notes: { type: "string" }, url: { type: "string", description: "Asana permalink" },
          project: { type: "string" }, client: { type: "string", description: "Client or brand, if the task has a field for it" },
          attachments: { type: "array", items: { type: "object", properties: { name: { type: "string" }, url: { type: "string", description: "view_url or permanent_url" } } } },
          comments: { type: "array", items: { type: "object", properties: { author: PERSON, at: { type: "string" }, text: { type: "string" } } } },
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
    const t = typeof args.task_id === "string" && /^[0-9a-f-]{36}$/i.test(args.task_id) ? await db.query.tasks.findFirst({ where: eq(tasks.id, args.task_id) }) : null;
    if (!t) throw new Error("Task not found");
    // Only the person's own tasks (owner, assignee, account owner or creator); admins can update any task.
    const actor = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const { taskAssignees } = await import("@/db/schema");
    const assigned = await db.select().from(taskAssignees).where(and(eq(taskAssignees.taskId, t.id), eq(taskAssignees.userId, userId)));
    if (actor?.role !== "admin" && ![t.ownerId, t.accountOwnerId, t.createdBy].includes(userId) && !assigned.length) throw new Error("You can only update your own tasks.");
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
    const src = await db.select().from(engagementSources).where(inArray(engagementSources.kind, ["aurasell_account", "email_domain"]));
    const done = await db.select().from(processedItems).where(eq(processedItems.provider, "aurasell"));
    return rows.map((r) => {
      const mine = src.filter((s) => s.engagementId === r.e.id);
      const domains = [...new Set([...mine.filter((s) => s.kind === "email_domain").map((s) => s.value), ...(r.c.domain ? [r.c.domain] : [])])];
      const ids = [...new Set([...mine.filter((s) => s.kind === "aurasell_account").map((s) => s.value), ...(r.c.aurasellAccountId ? [r.c.aurasellAccountId] : [])])];
      return { r, domains, ids };
    }).filter(({ r, domains, ids }) => categoryOf(r.e.category).section !== "creative" && (domains.length || ids.length)).map(({ r, domains, ids }) => ({
      engagement_id: r.e.id, engagement: `${r.c.name} · ${r.e.name}`,
      aurasell_account_ids: ids, email_domains: domains,
      aurasell_opportunity_id: r.e.aurasellOpportunityId,
      processed_meeting_ids: done.filter((d) => d.engagementId === r.e.id).map((d) => d.externalId),
    }));
  }
  if (name === "save_client_activity") {
    const e = await db.query.engagements.findFirst({ where: eq(engagements.id, String(args.engagement_id ?? "")) });
    if (!e) throw new Error("Unknown engagement_id");
    const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : undefined);
    const who = (p: any): StoredPerson | null => (p && (p.name || p.email) ? { name: str(p.name, 120) ?? "", email: str(p.email, 200), client: !!p.client } : null); // eslint-disable-line @typescript-eslint/no-explicit-any
    const meetings: StoredMeeting[] = (Array.isArray(args.meetings) ? args.meetings : []).slice(0, 100).filter((m: any) => m?.id && m?.start).map((m: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: String(m.id), title: str(m.title, 300) ?? "Meeting", start: String(m.start), end: str(m.end, 40) ?? null, link: str(m.link, 500) ?? null,
      people: (Array.isArray(m.people) ? m.people : []).slice(0, 30).map(who).filter(Boolean) as StoredPerson[],
      summary: str(m.summary, 4000) ?? null, has_recording: !!m.has_recording, heat: str(m.heat, 20) ?? null,
    }));
    const emails: StoredEmail[] = (Array.isArray(args.emails) ? args.emails : []).slice(0, 100).filter((m: any) => m?.id && m?.at).map((m: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: String(m.id), title: str(m.title, 300) ?? "(no subject)", at: String(m.at), from: who(m.from),
      to: (Array.isArray(m.to) ? m.to : []).slice(0, 30).map(who).filter(Boolean) as StoredPerson[], snippet: str(m.snippet, 400) ?? null,
    }));
    await ensureClientActivityTable();
    const values = { accountName: str(args.account_name, 200) ?? null, meetings, emails, syncedAt: new Date() };
    await db.insert(clientActivity).values({ engagementId: e.id, ...values }).onConflictDoUpdate({ target: clientActivity.engagementId, set: values });
    return { saved: { meetings: meetings.length, emails: emails.length } };
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
  if (name === "import_asana_completed_tasks") return importAsanaTasks(userId, args);
  throw new Error(`Unknown tool ${name}`);
}

// Tools a person's own ChatGPT or Claude gets after signing in. The sync and import tools stay for
// tokens made on the Connections page (scheduled tasks and the Asana migration).
const PERSONAL_TOOLS = new Set(["my_tasks", "update_task", "create_task", "engagement_summary"]);
const ANNOTATIONS: Record<string, { title: string; readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean }> = {
  my_tasks: { title: "My tasks", readOnlyHint: true, openWorldHint: false },
  engagement_summary: { title: "Engagement summary", readOnlyHint: true, openWorldHint: false },
  update_task: { title: "Update a task", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  create_task: { title: "Add a task", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
};
const VERSIONS = ["2025-06-18", "2025-11-25", "2025-03-26", "2024-11-05"];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };

function unauthorized(why = "unauthorized") {
  return NextResponse.json({ error: why }, { status: 401, headers: { ...CORS, "WWW-Authenticate": `Bearer resource_metadata="${appUrl()}/.well-known/oauth-protected-resource"` } });
}

/** Who is calling: a connector sign-in (rlo_…) or a Connections-page token (rlp_…). */
async function caller(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  if (token.startsWith("rlo_")) {
    const t = await userForAccessToken(token);
    return t ? { userId: t.userId, personal: true } : null;
  }
  const row = await db.query.apiTokens.findFirst({ where: eq(apiTokens.tokenHash, sha256(token)) });
  if (!row) return null;
  if (row.label === TEMP_TOKEN_LABEL && Date.now() - row.createdAt.getTime() > TEMP_TOKEN_HOURS * 3600_000) return "expired" as const;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  return { userId: row.userId, personal: false };
}

export async function POST(req: Request) {
  const who = await caller(req);
  if (!who || who === "expired") {
    const auth = req.headers.get("authorization") ?? "";
    oauthLog("mcp 401", { why: who === "expired" ? "expired migration token" : !auth ? "no token" : auth.includes("rlo_") ? "connector token invalid or expired" : "unknown token", ua: req.headers.get("user-agent")?.slice(0, 80) });
    return unauthorized(who === "expired" ? "token expired" : "unauthorized");
  }
  const me = await db.query.users.findFirst({ where: eq(users.id, who.userId) });
  const tools = (who.personal ? TOOLS.filter((t) => PERSONAL_TOOLS.has(t.name)) : TOOLS).map((t) => (ANNOTATIONS[t.name] ? { ...t, annotations: ANNOTATIONS[t.name] } : t));

  const msg = (await req.json().catch(() => null)) as { id?: number | string; method: string; params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string } } | null;
  if (!msg || typeof msg.method !== "string") return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  const reply = (result: unknown) => NextResponse.json({ jsonrpc: "2.0", id: msg.id, result }, { headers: CORS });
  if (msg.method.startsWith("notifications/")) return new NextResponse(null, { status: 202, headers: CORS });
  switch (msg.method) {
    case "initialize": {
      oauthLog("mcp initialize", { user: who.userId, connector: who.personal, version: msg.params?.protocolVersion, ua: req.headers.get("user-agent")?.slice(0, 80) });
      const asked = msg.params?.protocolVersion;
      return reply({ protocolVersion: asked && VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: "revlogic-projects", title: "revlogic Projects", version: "0.2.0" },
        instructions: `Signed in as ${me?.name}. Use these tools for this person's revlogic tasks and engagements. Task ids come from my_tasks.` });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools });
    case "tools/call":
      try {
        const name = msg.params?.name ?? "";
        if (!tools.some((t) => t.name === name)) throw new Error(`Unknown tool ${name}`);
        const out = await runTool(who.userId, name, (msg.params?.arguments ?? {}) as Record<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: Array.isArray(out) ? { items: out } : out });
      } catch (err) {
        // Include the database's own reason (drizzle puts it in .cause) so errors can be diagnosed.
        const e = err as Error & { cause?: { message?: string } };
        return reply({ content: [{ type: "text", text: [e.message?.split("\nparams:")[0], e.cause?.message].filter(Boolean).join(" | ") }], isError: true });
      }
    default:
      return NextResponse.json({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } }, { headers: CORS });
  }
}

// No server-to-client stream: this server answers every request with plain JSON (allowed by Streamable HTTP).
export async function GET() {
  return new NextResponse("Method not allowed", { status: 405, headers: { ...CORS, Allow: "POST" } });
}
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
