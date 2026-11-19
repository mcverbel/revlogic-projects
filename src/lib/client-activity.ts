// Client activity on the Overview tab: the client's meetings (upcoming and past) and latest emails,
// read live from Aurasell with the viewer's own Aurasell sign-in.
import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { clients, connections, engagementSources, engagements, users } from "@/db/schema";
import { aurasellToken, AURASELL } from "@/lib/sources/aurasell";
import { McpAuthError, McpClient } from "@/lib/mcp-client";

const MEETING_TYPES = new Set(["gcal", "outlook-calendar", "aurameet", "zoom", "gong", "chorus", "fathom", "granola", "grain", "salesloft", "firefly", "microsoft-teams", "jiminny", "call", "dialer"]);
const EMAIL_TYPES = new Set(["gmail", "outlook-email"]);

type TParticipant = { email?: string; first_name?: string; last_name?: string; participant_type?: string; is_sender?: boolean };
type TEntry = { message_id: string; title?: string; snippet?: string; start_time: string; type: string; participants?: TParticipant[]; signal_strength?: string; message_count?: number };
type LMeeting = {
  id: string; cri_message_id?: string; title?: string; status?: string; meeting_link?: string;
  scheduled_start_time?: string; scheduled_end_time?: string; actual_start_time?: string; actual_end_time?: string;
  has_recording?: boolean; has_transcript?: boolean;
};

export type Person = { name: string; client: boolean };
export type ActivityMeeting = {
  id: string; title: string; start: string; end: string | null; minutes: number | null; link: string | null;
  people: Person[]; hasSummary: boolean; hasRecording: boolean; heat: string | null;
};
export type ActivityEmail = { id: string; title: string; at: string; from: Person | null; to: Person[]; snippet: string; fromClient: boolean };
export type ClientActivity =
  | { state: "no_account" }
  | { state: "no_connection" }
  | { state: "needs_reconnect" }
  | { state: "error" }
  | {
      state: "ok"; accountName: string; fetchedAt: string;
      upcoming: ActivityMeeting[]; past: ActivityMeeting[];
      lastFromClient: ActivityEmail | null; lastFromUs: ActivityEmail | null; latestEmail: ActivityEmail | null;
      lastContact: string | null; meetings30: number; emails30: number;
    };

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

/** The client's Aurasell account: the one set on the project, else the client record, else a match on the client's email domain. */
async function accountFor(engagementId: string, client: McpClient) {
  const src = await db.select().from(engagementSources).where(and(eq(engagementSources.engagementId, engagementId), eq(engagementSources.kind, "aurasell_account")));
  if (src[0]) return { id: src[0].value, name: null as string | null };
  const e = await db.query.engagements.findFirst({ where: eq(engagements.id, engagementId) });
  const c = e ? await db.query.clients.findFirst({ where: eq(clients.id, e.clientId) }) : null;
  if (c?.aurasellAccountId) return { id: c.aurasellAccountId, name: c.name };
  const domains = (await db.select().from(engagementSources).where(and(eq(engagementSources.engagementId, engagementId), eq(engagementSources.kind, "email_domain")))).map((s) => s.value);
  if (c?.domain && !domains.includes(c.domain)) domains.push(c.domain);
  for (const d of domains) {
    const r = await client.call<{ accounts?: { id: string; name: string }[] }>("search_accounts", { query: `domain = "${d.replace(/"/g, "")}"`, limit: 1 });
    if (r.accounts?.[0]) return { id: r.accounts[0].id, name: r.accounts[0].name };
  }
  return null;
}

async function fetchActivity(engagementId: string, userId: string): Promise<ClientActivity> {
  const conn = await db.query.connections.findFirst({ where: and(eq(connections.userId, userId), eq(connections.provider, "aurasell")) });
  if (!conn) return { state: "no_connection" };
  const token = await aurasellToken(userId);
  if (!token) return { state: "needs_reconnect" };
  const client = new McpClient(AURASELL.mcpUrl(), token);
  try {
    const account = await accountFor(engagementId, client);
    if (!account) return { state: "no_account" };
    const now = Date.now();
    const day = 86_400_000;
    const [timeline, listed, acct] = await Promise.all([
      client.call<{ timeline?: TEntry[] }>("get_conversation_timeline", {
        entity_type: "account", entity_id: account.id, from: new Date(now - 90 * day).toISOString(), to: new Date(now + 60 * day).toISOString(), limit: 300,
      }),
      client.call<{ meetings?: LMeeting[] }>("list_meetings", {
        entity_type: "account", entity_id: account.id, from: new Date(now - 90 * day).toISOString(), to: new Date(now + 60 * day).toISOString(), order: "asc",
      }).catch(() => ({ meetings: [] as LMeeting[] })),
      account.name ? Promise.resolve({ account: { name: account.name } }) : client.call<{ account?: { name: string }; name?: string }>("get_account", { account_id: account.id }).catch(() => ({ account: { name: "" } })),
    ]);

    // Show teammates by their full name from the app; client contacts by their name in Aurasell.
    const team = await db.select({ email: users.email, name: users.name }).from(users);
    const person = (p: TParticipant): Person => {
      const known = p.email ? team.find((u) => u.email.toLowerCase() === p.email!.toLowerCase()) : undefined;
      const name = known?.name ?? ([p.first_name, p.last_name].filter(Boolean).join(" ") || (p.email ?? "").split("@")[0] || "Someone");
      return { name, client: p.participant_type === "contact" };
    };
    const byMsg = new Map((listed.meetings ?? []).flatMap((m) => [[m.cri_message_id ?? m.id, m], [m.id, m]] as [string, LMeeting][]));
    const entries = (timeline.timeline ?? []).filter((t) => t.start_time);

    const meetings: ActivityMeeting[] = [];
    const seen = new Set<string>();
    for (const t of entries.filter((t) => MEETING_TYPES.has(t.type))) {
      const m = byMsg.get(t.message_id);
      if (m?.status === "cancelled" || seen.has(t.message_id)) continue;
      seen.add(t.message_id);
      const start = m?.actual_start_time ?? m?.scheduled_start_time ?? t.start_time;
      const end = m?.actual_end_time ?? m?.scheduled_end_time ?? null;
      meetings.push({
        id: m?.cri_message_id ?? t.message_id, title: strip(t.title || m?.title || "Meeting"), start, end,
        minutes: end ? Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 60000)) : null,
        link: m?.meeting_link ?? null, people: (t.participants ?? []).map(person),
        hasSummary: !!m?.has_transcript || !m && !["gcal", "outlook-calendar"].includes(t.type), hasRecording: !!m?.has_recording,
        heat: t.signal_strength && ["hot", "very_hot"].includes(t.signal_strength) ? (t.signal_strength === "very_hot" ? "very hot" : "hot") : null,
      });
    }
    // Meetings Aurasell scheduled that the timeline didn't list yet (future calendar events).
    for (const m of listed.meetings ?? []) {
      const id = m.cri_message_id ?? m.id;
      if (seen.has(id) || m.status === "cancelled" || !m.scheduled_start_time) continue;
      seen.add(id);
      meetings.push({ id, title: strip(m.title || "Meeting"), start: m.actual_start_time ?? m.scheduled_start_time, end: m.actual_end_time ?? m.scheduled_end_time ?? null,
        minutes: null, link: m.meeting_link ?? null, people: [], hasSummary: !!m.has_transcript, hasRecording: !!m.has_recording, heat: null });
    }
    const upcoming = meetings.filter((m) => Date.parse(m.end ?? m.start) > now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
    const past = meetings.filter((m) => Date.parse(m.end ?? m.start) <= now).sort((a, b) => b.start.localeCompare(a.start));

    const emails: ActivityEmail[] = entries.filter((t) => EMAIL_TYPES.has(t.type) && Date.parse(t.start_time) <= now)
      // Calendar invitations arrive as emails; they're already shown as meetings.
      .filter((t) => !/^(invitation|updated invitation|accepted|declined|canceled|cancelled)\b/i.test(t.title ?? ""))
      .map((t) => {
        const sender = (t.participants ?? []).find((p) => p.is_sender);
        return {
          id: t.message_id, title: strip(t.title || "(no subject)"), at: t.start_time,
          from: sender ? person(sender) : null, to: (t.participants ?? []).filter((p) => !p.is_sender).map(person),
          snippet: strip(t.snippet ?? "").slice(0, 200), fromClient: sender?.participant_type === "contact",
        };
      }).sort((a, b) => b.at.localeCompare(a.at));

    const since30 = now - 30 * day;
    const lastContact = [past[0]?.start, emails[0]?.at].filter(Boolean).sort().at(-1) ?? null;
    return {
      state: "ok", accountName: acct.account?.name || (acct as { name?: string }).name || "", fetchedAt: new Date().toISOString(),
      upcoming, past: past.slice(0, 3),
      lastFromClient: emails.find((m) => m.fromClient) ?? null, lastFromUs: emails.find((m) => !m.fromClient && m.from) ?? null, latestEmail: emails[0] ?? null,
      lastContact,
      meetings30: past.filter((m) => Date.parse(m.start) >= since30).length,
      emails30: emails.filter((m) => Date.parse(m.at) >= since30).length,
    };
  } catch (err) {
    if (err instanceof McpAuthError) {
      await db.update(connections).set({ status: "needs_reconnect" }).where(and(eq(connections.userId, userId), eq(connections.provider, "aurasell")));
      return { state: "needs_reconnect" };
    }
    console.error("client activity", err);
    return { state: "error" };
  }
}

/** Cached per person and project for 5 minutes, so opening the Overview stays fast. */
export function clientActivity(engagementId: string, userId: string) {
  return unstable_cache(() => fetchActivity(engagementId, userId), ["client-activity", engagementId, userId], { revalidate: 300 })();
}

/** Aurasell's summary of one meeting, read as the viewer. */
export async function meetingSummary(messageId: string, userId: string): Promise<string | null> {
  const token = await aurasellToken(userId);
  if (!token) return null;
  const client = new McpClient(AURASELL.mcpUrl(), token);
  type S = { meeting_summary?: { internal_mom_summary?: { summary?: string; next_steps?: { internal_next_steps?: { next_step: string }[]; external_next_steps?: { next_step: string }[] } } } };
  const s = await client.call<S>("get_meeting_summary", { message_id: messageId, summary_type: "moms_internal" }).catch(() => null);
  const mom = s?.meeting_summary?.internal_mom_summary;
  if (!mom?.summary) return null;
  const steps = [...(mom.next_steps?.internal_next_steps ?? []), ...(mom.next_steps?.external_next_steps ?? [])].map((x) => `- ${x.next_step}`);
  return [mom.summary, steps.length ? `Next steps:\n${steps.join("\n")}` : ""].filter(Boolean).join("\n\n");
}
