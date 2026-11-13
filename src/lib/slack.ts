// Minimal Slack Web API client (bot token). Every call is a no-op when SLACK_BOT_TOKEN is not set.
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const token = () => process.env.SLACK_BOT_TOKEN;

export async function slackApi<T = Record<string, unknown>>(method: string, body: Record<string, unknown>, userToken?: string): Promise<T | null> {
  const t = userToken ?? token();
  if (!t) return null;
  const isGet = method.startsWith("conversations.") || method.startsWith("users.") || method === "search.messages";
  const url = `https://slack.com/api/${method}` + (isGet ? `?${new URLSearchParams(body as Record<string, string>)}` : "");
  const res = await fetch(url, {
    method: isGet ? "GET" : "POST",
    headers: { Authorization: `Bearer ${t}`, ...(isGet ? {} : { "Content-Type": "application/json; charset=utf-8" }) },
    body: isGet ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as T & { ok: boolean; error?: string };
  if (!json.ok) {
    console.warn(`Slack ${method} failed: ${json.error}`);
    return null;
  }
  return json;
}

async function slackIdFor(userId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) return null;
  if (u.slackUserId) return u.slackUserId;
  const r = await slackApi<{ user: { id: string } }>("users.lookupByEmail", { email: u.email });
  if (r?.user?.id) {
    await db.update(users).set({ slackUserId: r.user.id }).where(eq(users.id, userId));
    return r.user.id;
  }
  return null;
}

export async function dmUser(userId: string, text: string, blocks?: unknown[]) {
  const sid = await slackIdFor(userId);
  if (!sid) return;
  await slackApi("chat.postMessage", { channel: sid, text, unfurl_links: false, unfurl_media: false, ...(blocks ? { blocks } : {}) });
}

export async function postToChannel(channel: string | null | undefined, text: string) {
  if (!channel) return;
  await slackApi("chat.postMessage", { channel, text, unfurl_links: false });
}
