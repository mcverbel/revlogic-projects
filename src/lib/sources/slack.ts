import { slackApi } from "@/lib/slack";
import type { SourceItem } from "./types";

type SlackMsg = { ts: string; user?: string; text: string; bot_id?: string; permalink?: string };

/** Messages in a mapped channel since `since` (the bot must be invited to the channel). */
export async function slackChannelItems(channel: string, since: Date): Promise<SourceItem[]> {
  const r = await slackApi<{ messages: SlackMsg[] }>("conversations.history", { channel, oldest: String(since.getTime() / 1000), limit: "200" });
  const msgs = (r?.messages ?? []).filter((m) => !m.bot_id && m.text?.trim());
  if (!msgs.length) return [];
  // Group the window into one item so Claude sees the conversation, not single lines
  const text = msgs.reverse().map((m) => `[${new Date(Number(m.ts) * 1000).toISOString()}] <@${m.user}>: ${m.text}`).join("\n").slice(0, 8000);
  const last = msgs[msgs.length - 1]!;
  return [{
    provider: "slack", externalId: `${channel}:${last.ts}`, title: `Slack channel ${channel}`,
    url: `https://slack.com/app_redirect?channel=${channel}`, occurredAt: new Date(Number(last.ts) * 1000).toISOString(),
    participants: [], text,
  }];
}

/** A person's own DMs / group DMs that mention the client (needs their user token with search:read). */
export async function slackDmItems(userToken: string, clientName: string, since: Date): Promise<SourceItem[]> {
  const after = since.toISOString().slice(0, 10);
  const r = await slackApi<{ messages: { matches: (SlackMsg & { channel: { id: string; is_im?: boolean; is_mpim?: boolean } })[] } }>(
    "search.messages", { query: `"${clientName}" after:${after}`, count: "20", sort: "timestamp" }, userToken,
  );
  return (r?.messages.matches ?? [])
    .filter((m) => m.channel.is_im || m.channel.is_mpim)
    .map((m) => ({
      provider: "slack" as const, externalId: `${m.channel.id}:${m.ts}`, title: "Slack DM",
      url: m.permalink, occurredAt: new Date(Number(m.ts) * 1000).toISOString(), participants: [], text: m.text.slice(0, 3000),
    }));
}
