/**
 * Aurasell through its MCP server (https://app.aurasell.ai/mcp), signed in as each person.
 * Same tools Claude uses: list_meetings, get_meeting_summary, get_opportunity.
 * Sign-in is Aurasell's Auth0 (OAuth 2.1 + PKCE, public client: no secret).
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { McpClient, McpAuthError } from "@/lib/mcp-client";
import type { SourceItem } from "./types";

export const AURASELL = {
  mcpUrl: () => process.env.AURASELL_MCP_URL || "https://app.aurasell.ai/mcp",
  authorize: "https://auth.aurasell.ai/authorize",
  token: "https://auth.aurasell.ai/oauth/token",
  clientId: () => process.env.AURASELL_OAUTH_CLIENT_ID ?? "",
  scope: "mcp:access offline_access",
};

export function aurasellConfigured() {
  return !!AURASELL.clientId();
}

/** A valid access token for this person, refreshing it when needed. */
export async function aurasellToken(userId: string): Promise<string | null> {
  const c = await db.query.connections.findFirst({ where: and(eq(connections.userId, userId), eq(connections.provider, "aurasell"), eq(connections.status, "active")) });
  if (!c?.encryptedToken) return null;
  if (!c.expiresAt || c.expiresAt.getTime() > Date.now() + 60_000) return decrypt(c.encryptedToken);
  if (!c.encryptedRefreshToken) return null;
  const res = await fetch(AURASELL.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: AURASELL.clientId(), refresh_token: decrypt(c.encryptedRefreshToken) }),
  });
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!j.access_token) {
    await db.update(connections).set({ status: "needs_reconnect" }).where(eq(connections.id, c.id));
    return null;
  }
  await db.update(connections).set({
    encryptedToken: encrypt(j.access_token),
    encryptedRefreshToken: j.refresh_token ? encrypt(j.refresh_token) : c.encryptedRefreshToken,
    expiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000),
  }).where(eq(connections.id, c.id));
  return j.access_token;
}

async function clientFor(userIds: string[]): Promise<{ client: McpClient; userId: string } | null> {
  for (const userId of userIds) {
    const token = await aurasellToken(userId);
    if (token) return { client: new McpClient(AURASELL.mcpUrl(), token), userId };
  }
  return null;
}

/** Anyone in the company with an active Aurasell connection (admins first). */
export async function anyAurasellUserIds(): Promise<string[]> {
  const rows = await db.select().from(connections).where(and(eq(connections.provider, "aurasell"), eq(connections.status, "active")));
  return rows.map((r) => r.userId!).filter(Boolean);
}

type Meeting = { id: string; cri_message_id?: string; title: string; actual_start_time?: string; scheduled_start_time: string; has_transcript?: boolean; meeting_link?: string };
type Citation = { source_text: string; speaker_name?: string; start_time?: number };
type Step = { next_step: string; citations?: Citation[] };
type Summary = { meeting_summary?: { internal_mom_summary?: { summary?: string; next_steps?: { internal_next_steps?: Step[]; external_next_steps?: Step[] } } } };

const mmss = (ms?: number) => (ms == null ? undefined : `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`);

/** Recorded meetings on an Aurasell account since `since`, read as the first engagement member who connected Aurasell. */
export async function aurasellItems(accountId: string, since: Date, userIds: string[]): Promise<SourceItem[]> {
  const c = await clientFor(userIds);
  if (!c) return [];
  try {
    const { meetings } = await c.client.call<{ meetings: Meeting[] }>("list_meetings", {
      entity_type: "account", entity_id: accountId, from: since.toISOString(), to: new Date().toISOString(), order: "desc",
    });
    const items: SourceItem[] = [];
    for (const m of (meetings ?? []).filter((m) => m.has_transcript !== false)) {
      const s = await c.client.call<Summary>("get_meeting_summary", { message_id: m.cri_message_id ?? m.id, summary_type: "moms_internal" });
      const mom = s.meeting_summary?.internal_mom_summary;
      const steps = [
        ...(mom?.next_steps?.internal_next_steps ?? []).map((x) => ({ ...x, side: "revlogic" })),
        ...(mom?.next_steps?.external_next_steps ?? []).map((x) => ({ ...x, side: "client" })),
      ];
      items.push({
        provider: "aurasell", externalId: m.id, title: m.title,
        occurredAt: m.actual_start_time ?? m.scheduled_start_time, participants: [],
        text: `Meeting: ${m.title}\nSummary: ${mom?.summary ?? ""}\n\nNext steps (${steps.length}):\n` + steps.map((x) => `- [${x.side}] ${x.next_step}`).join("\n"),
        hints: steps.map((x) => ({
          nextStep: `[${x.side}] ${x.next_step}`,
          quote: x.citations?.map((ci) => ci.source_text).join(" … "),
          speaker: x.citations?.[0]?.speaker_name,
          at: mmss(x.citations?.[0]?.start_time),
        })),
      });
    }
    return items;
  } catch (err) {
    if (err instanceof McpAuthError) await db.update(connections).set({ status: "needs_reconnect" }).where(and(eq(connections.userId, c.userId), eq(connections.provider, "aurasell")));
    throw err;
  }
}

/** Current deal stage for the journey bar. */
export async function aurasellDealStage(opportunityId: string): Promise<{ stage: string; status: string } | null> {
  const c = await clientFor(await anyAurasellUserIds());
  if (!c) return null;
  const o = await c.client.call<{ current_stage?: string; status?: string; opportunity?: { current_stage: string; status: string } }>("get_opportunity", { opportunity_id: opportunityId });
  const opp = o.opportunity ?? o;
  return opp.current_stage ? { stage: opp.current_stage, status: opp.status ?? "" } : null;
}
