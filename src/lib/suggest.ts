import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  engagements, clients, engagementMembers, engagementSources, users, suggestions, processedItems, connections, tasks,
  type SuggestionSource,
} from "@/db/schema";
import { decrypt, sha256 } from "@/lib/crypto";
import type { SourceItem } from "@/lib/sources/types";
import { gmailItems, gmailInternalMentions } from "@/lib/sources/google";
import { slackChannelItems, slackDmItems } from "@/lib/sources/slack";
import { aurasellItems, anyAurasellUserIds } from "@/lib/sources/aurasell";
import { otterItems } from "@/lib/sources/otter";

const LOOKBACK_DAYS = 14;

type Extracted = {
  suggestions: {
    title: string;
    kind: "task" | "waiting_on_client" | "milestone_estimate";
    owner_emails: string[];
    external_owner?: string;
    due_date?: string;
    due_text?: string;
    quote: string;
    speaker?: string;
    at?: string;
  }[];
  looks_done: { suggestion_id: string; evidence: string }[];
};

const TOOL: Anthropic.Tool = {
  name: "record_suggestions",
  description: "Record the action items found in the source material, and any pending suggestions this material shows are already done.",
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Imperative task title, specific, under 120 characters." },
            kind: { type: "string", enum: ["task", "waiting_on_client", "milestone_estimate"], description: "task = someone at revlogic must do it; waiting_on_client = the client owns it; milestone_estimate = your own inference of a date, NOT stated in the material." },
            owner_emails: { type: "array", items: { type: "string" }, description: "revlogic team members (from the roster) who own it. Empty if nobody was named." },
            external_owner: { type: "string", description: "Client-side owner name, for waiting_on_client." },
            due_date: { type: "string", description: "YYYY-MM-DD only if a date or relative day was actually said (resolve relative to the item date). Omit otherwise." },
            due_text: { type: "string", description: "The due wording as said, e.g. 'by Monday or Tuesday'." },
            quote: { type: "string", description: "Verbatim quote from the material that supports this suggestion. For milestone_estimate, explain the basis instead." },
            speaker: { type: "string" },
            at: { type: "string", description: "Timestamp within a call (mm:ss) when available." },
          },
          required: ["title", "kind", "owner_emails", "quote"],
        },
      },
      looks_done: {
        type: "array",
        items: {
          type: "object",
          properties: { suggestion_id: { type: "string" }, evidence: { type: "string", description: "One sentence: what in the material shows it's done." } },
          required: ["suggestion_id", "evidence"],
        },
      },
    },
    required: ["suggestions", "looks_done"],
  },
};

export async function extract(item: SourceItem, ctx: { engagement: string; client: string; roster: { name: string; email: string }[]; pending: { id: string; title: string }[]; openTasks: string[] }): Promise<Extracted> {
  const model = process.env.ANTHROPIC_MODEL;
  if (!process.env.ANTHROPIC_API_KEY || !model) throw new Error("ANTHROPIC_API_KEY and ANTHROPIC_MODEL must be set");
  const anthropic = new Anthropic();
  const system = [
    `You turn revlogic's client communications into suggested tasks for the engagement "${ctx.engagement}" with ${ctx.client}.`,
    `Only suggest concrete action items that someone actually committed to or was asked to do. Never invent people, dates or facts.`,
    `Owners must come from this roster (match by name or nickname): ${ctx.roster.map((r) => `${r.name} <${r.email}>`).join("; ")}.`,
    `Skip anything already covered by these open tasks: ${ctx.openTasks.join(" | ") || "(none)"}.`,
    `Skip anything already covered by these pending suggestions (unless the material shows it's done, then report it in looks_done): ${ctx.pending.map((p) => `[${p.id}] ${p.title}`).join(" | ") || "(none)"}.`,
    `At most one milestone_estimate, only when the material gives a real basis (e.g. an event date and a prep duration).`,
    `Always answer by calling the record_suggestions tool exactly once. If nothing actionable is present, call it with empty arrays.`,
  ].join("\n");
  const user = [
    `Source: ${item.provider} · ${item.title} · ${item.occurredAt}`,
    item.hints?.length ? `Next steps already extracted by Aurasell (use them, keep their quotes):\n${item.hints.map((h) => `- ${h.nextStep}${h.quote ? ` | quote: "${h.quote}"` : ""}${h.speaker ? ` | speaker: ${h.speaker}` : ""}${h.at ? ` | at: ${h.at}` : ""}`).join("\n")}` : "",
    `Material:\n"""\n${item.text}\n"""`,
  ].filter(Boolean).join("\n\n");

  const res = await anthropic.messages.create({
    model, max_tokens: 2000, system,
    tools: [TOOL], tool_choice: { type: "auto" },
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  return (block?.type === "tool_use" ? block.input : { suggestions: [], looks_done: [] }) as Extracted;
}

const PROVIDER_LABEL: Record<SourceItem["provider"], string> = { aurasell: "Recording", gmail: "Email", slack: "Slack", otter: "Otter" };

/** Collect new items for one engagement from every connected source and turn them into suggestions. */
export async function runSuggestionsForEngagement(engagementId: string) {
  const e = await db.query.engagements.findFirst({ where: eq(engagements.id, engagementId) });
  if (!e || e.archivedAt) return { created: 0 };
  const client = await db.query.clients.findFirst({ where: eq(clients.id, e.clientId) });
  const sources = await db.select().from(engagementSources).where(eq(engagementSources.engagementId, e.id));
  const members = await db.select({ u: users }).from(engagementMembers).innerJoin(users, eq(users.id, engagementMembers.userId)).where(eq(engagementMembers.engagementId, e.id));
  const roster = (await db.select().from(users)).map((u) => ({ id: u.id, name: u.name, email: u.email }));
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);

  const domains = sources.filter((s) => s.kind === "email_domain").map((s) => s.value);
  const items: SourceItem[] = [];
  const safe = async (p: Promise<SourceItem[]>) => { try { items.push(...(await p)); } catch (err) { console.warn("source failed", err); } };

  // Company sources
  const memberIds = members.map(({ u }) => u.id);
  for (const s of sources.filter((s) => s.kind === "aurasell_account")) await safe(aurasellItems(s.value, since, [...memberIds, ...(await anyAurasellUserIds())]));
  for (const s of sources.filter((s) => s.kind === "slack_channel")) await safe(slackChannelItems(s.value, since));
  // Personal sources of each engagement member
  for (const { u } of members) {
    await safe(gmailItems(u.id, domains, since));
    if (client) await safe(gmailInternalMentions(u.id, client.name, since));
    const personal = await db.select().from(connections).where(and(eq(connections.userId, u.id), eq(connections.status, "active")));
    const slackUser = personal.find((c) => c.provider === "slack_user");
    if (slackUser?.encryptedToken && client) await safe(slackDmItems(decrypt(slackUser.encryptedToken), client.name, since));
    const otter = personal.find((c) => c.provider === "otter");
    if (otter?.encryptedToken && client) await safe(otterItems(decrypt(otter.encryptedToken), { clientName: client.name, domains }, since));
  }

  // Never process the same item twice (the same email shows up in several inboxes)
  const seen = new Set<string>();
  const done = items.length
    ? await db.select().from(processedItems).where(and(eq(processedItems.engagementId, e.id), inArray(processedItems.externalId, items.map((i) => i.externalId))))
    : [];
  const fresh = items.filter((i) => {
    const k = `${i.provider}:${i.externalId}`;
    if (seen.has(k) || done.some((d) => d.provider === i.provider && d.externalId === i.externalId)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  let created = 0;
  for (const item of fresh) {
    const pending = await db.select().from(suggestions).where(and(eq(suggestions.engagementId, e.id), eq(suggestions.status, "pending")));
    const open = await db.select({ title: tasks.title }).from(tasks).where(and(eq(tasks.engagementId, e.id), isNull(tasks.completedAt)));
    const out = await extract(item, { engagement: e.name, client: client?.name ?? "", roster, pending: pending.map((p) => ({ id: p.id, title: p.title })), openTasks: open.map((o) => o.title) });

    for (const s of out.suggestions) {
      const fingerprint = sha256(`${e.id}:${s.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`);
      const source: SuggestionSource = {
        provider: item.provider, url: item.url, quote: s.quote, speaker: s.speaker, at: s.at, externalId: item.externalId,
        label: [s.speaker, s.at, `${PROVIDER_LABEL[item.provider]} · ${item.title}`].filter(Boolean).join(" · "),
      };
      const dup = pending.find((p) => p.fingerprint === fingerprint);
      if (dup) {
        await db.update(suggestions).set({ sources: [...dup.sources, source] }).where(eq(suggestions.id, dup.id));
        continue;
      }
      const ownerIds = s.owner_emails.map((em) => roster.find((r) => r.email.toLowerCase() === em.toLowerCase())?.id).filter(Boolean) as string[];
      await db.insert(suggestions).values({
        engagementId: e.id, title: s.title.slice(0, 300), kind: s.kind, ownerIds, externalOwner: s.external_owner ?? null,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(s.due_date ?? "") ? s.due_date! : null, dueText: s.due_text ?? null,
        sources: [source], fingerprint,
      });
      created++;
    }
    for (const ld of out.looks_done) {
      if (pending.some((p) => p.id === ld.suggestion_id)) {
        await db.update(suggestions).set({ looksDoneEvidence: `${PROVIDER_LABEL[item.provider]} · ${ld.evidence}` }).where(eq(suggestions.id, ld.suggestion_id));
      }
    }
    await db.insert(processedItems).values({ provider: item.provider, externalId: item.externalId, engagementId: e.id }).onConflictDoNothing();
  }
  return { created, read: fresh.length };
}

export async function runSuggestionsForAll() {
  const list = await db.select({ id: engagements.id }).from(engagements).where(isNull(engagements.archivedAt));
  const results = [];
  for (const { id } of list) {
    try { results.push({ id, ...(await runSuggestionsForEngagement(id)) }); }
    catch (err) { results.push({ id, error: String(err) }); }
  }
  return results;
}
