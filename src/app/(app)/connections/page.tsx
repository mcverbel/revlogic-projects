import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections, apiTokens } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { aurasellConfigured } from "@/lib/sources/aurasell";
import { ConnectionsView } from "@/components/connections-view";

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ error?: string; why?: string; connected?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const mine = await db.select().from(connections).where(eq(connections.userId, me.id));
  const tokens = await db.select().from(apiTokens).where(and(eq(apiTokens.userId, me.id)));
  const sync = await db.query.connections.findFirst({ where: and(eq(connections.scope, "company"), eq(connections.provider, "aurasell_sync")) });
  const status = (p: string) => {
    const c = mine.find((x) => x.provider === p);
    return c ? { connected: c.status === "active", needsReconnect: c.status === "needs_reconnect", lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null } : { connected: false, needsReconnect: false, lastSyncedAt: null };
  };
  return (
    <>
    {sp.error && <div className="card border-[#5a2a2d] px-5 py-3 text-[13px] text-red max-w-[1100px]">Couldn&apos;t connect {sp.error === "aurasell" ? "Aurasell" : "Slack"}{sp.why ? `: ${sp.why}` : ""}. Send this message to Claude.</div>}
    {sp.connected && <div className="card border-[#2f6b4d] px-5 py-3 text-[13px] text-mint max-w-[1100px]">{sp.connected === "aurasell" ? "Aurasell" : "Slack"} connected.</div>}
    <ConnectionsView
      isAdmin={me.role === "admin"}
      company={{ aurasell: aurasellConfigured(), aurasellSyncedAt: sync?.lastSyncedAt?.toISOString() ?? null, slackApp: !!process.env.SLACK_BOT_TOKEN, claude: !!process.env.ANTHROPIC_API_KEY && !!process.env.ANTHROPIC_MODEL }}
      mine={{ gmail: status("gmail"), slackUser: status("slack_user"), otter: status("otter"), aurasell: status("aurasell") }}
      slackOAuthReady={!!process.env.SLACK_CLIENT_ID}
      tokens={tokens.map((t) => ({ id: t.id, label: t.label ?? "Claude", lastUsedAt: t.lastUsedAt?.toISOString() ?? null }))}
      appUrl={process.env.APP_URL ?? ""}
      refreshUrl={process.env.AURASELL_SYNC_TASK_URL ?? null}
    />
    </>
  );
}
