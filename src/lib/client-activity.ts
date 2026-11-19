// Client activity on the Overview tab: the client's meetings (upcoming and past) and latest emails.
// The scheduled Aurasell sync (a Claude task with the Aurasell connector) reads them and sends them
// through the tracker connector's save_client_activity tool; this file only reads what it saved.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientActivity as activityTable, clients, engagementSources, engagements, users, type StoredEmail, type StoredMeeting, type StoredPerson } from "@/db/schema";

export type Person = { name: string; client: boolean };
export type ActivityMeeting = {
  id: string; title: string; start: string; end: string | null; minutes: number | null; link: string | null;
  people: Person[]; summary: string | null; hasRecording: boolean; heat: string | null;
};
export type ActivityEmail = { id: string; title: string; at: string; from: Person | null; to: Person[]; snippet: string; fromClient: boolean };
export type ClientActivity =
  | { state: "no_account" }
  | { state: "waiting" }
  | {
      state: "ok"; accountName: string; fetchedAt: string;
      upcoming: ActivityMeeting[]; past: ActivityMeeting[];
      lastFromClient: ActivityEmail | null; lastFromUs: ActivityEmail | null; latestEmail: ActivityEmail | null;
      lastContact: string | null; meetings30: number; emails30: number;
    };

const valid = (iso: unknown): iso is string => typeof iso === "string" && !Number.isNaN(Date.parse(iso));

/** Creates the client_activity table if its migration hasn't been run on this database yet. */
let ensured = false;
export async function ensureClientActivityTable() {
  if (ensured) return;
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "client_activity" (
    "engagement_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."engagements"("id") ON DELETE cascade,
    "account_name" text,
    "meetings" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "synced_at" timestamp with time zone DEFAULT now() NOT NULL)`));
  ensured = true;
}

export async function clientActivity(engagementId: string): Promise<ClientActivity> {
  // This card must never take the whole Overview down (e.g. before its migration has run).
  try {
    return await readActivity(engagementId);
  } catch (err) {
    console.error("client activity", err);
    return { state: "waiting" };
  }
}

async function readActivity(engagementId: string): Promise<ClientActivity> {
  await ensureClientActivityTable();
  const row = await db.query.clientActivity.findFirst({ where: eq(activityTable.engagementId, engagementId) });
  if (!row) {
    const linked = await db.select().from(engagementSources)
      .where(and(eq(engagementSources.engagementId, engagementId), inArray(engagementSources.kind, ["aurasell_account", "email_domain"])));
    const e = await db.query.engagements.findFirst({ where: eq(engagements.id, engagementId) });
    const c = e ? await db.query.clients.findFirst({ where: eq(clients.id, e.clientId) }) : null;
    return linked.length || c?.domain || c?.aurasellAccountId ? { state: "waiting" } : { state: "no_account" };
  }

  // Teammates show by their name in the app; anyone with a revlogic account is never "the client".
  const team = await db.select({ email: users.email, name: users.name }).from(users);
  const person = (p: StoredPerson): Person => {
    const known = p.email ? team.find((u) => u.email.toLowerCase() === p.email!.toLowerCase()) : undefined;
    return { name: known?.name ?? (p.name || p.email?.split("@")[0] || "Someone"), client: known ? false : !!p.client };
  };

  const now = Date.now();
  const day = 86_400_000;
  const meetings: ActivityMeeting[] = (row.meetings as StoredMeeting[]).filter((m) => m?.id && valid(m.start)).map((m) => {
    const end = valid(m.end) ? m.end : null;
    return {
      id: m.id, title: m.title || "Meeting", start: m.start, end,
      minutes: end ? Math.max(1, Math.round((Date.parse(end) - Date.parse(m.start)) / 60000)) : null,
      link: m.link && /^https:\/\//.test(m.link) ? m.link : null,
      people: (m.people ?? []).map(person), summary: m.summary?.trim() || null, hasRecording: !!m.has_recording,
      heat: m.heat === "very_hot" || m.heat === "very hot" ? "very hot" : m.heat === "hot" ? "hot" : null,
    };
  });
  const upcoming = meetings.filter((m) => Date.parse(m.end ?? m.start) > now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
  const past = meetings.filter((m) => Date.parse(m.end ?? m.start) <= now).sort((a, b) => b.start.localeCompare(a.start));

  const emails: ActivityEmail[] = (row.emails as StoredEmail[]).filter((m) => m?.id && valid(m.at) && Date.parse(m.at) <= now)
    // Calendar invitations arrive as emails; they're already shown as meetings.
    .filter((m) => !/^(invitation|updated invitation|accepted|declined|canceled|cancelled)\b/i.test(m.title ?? ""))
    .map((m) => {
      const from = m.from ? person(m.from) : null;
      return { id: m.id, title: m.title || "(no subject)", at: m.at, from, to: (m.to ?? []).map(person), snippet: (m.snippet ?? "").slice(0, 200), fromClient: !!from?.client };
    }).sort((a, b) => b.at.localeCompare(a.at));

  const since30 = now - 30 * day;
  return {
    state: "ok", accountName: row.accountName ?? "", fetchedAt: row.syncedAt.toISOString(),
    upcoming, past: past.slice(0, 3),
    lastFromClient: emails.find((m) => m.fromClient) ?? null, lastFromUs: emails.find((m) => !m.fromClient && m.from) ?? null, latestEmail: emails[0] ?? null,
    lastContact: [past[0]?.start, emails[0]?.at].filter(Boolean).sort().at(-1) ?? null,
    meetings30: past.filter((m) => Date.parse(m.start) >= since30).length,
    emails30: emails.filter((m) => Date.parse(m.at) >= since30).length,
  };
}
