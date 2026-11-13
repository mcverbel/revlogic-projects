"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/session";

type Step = { step: string; ok: boolean; detail: string };

/** Walk through each step of sending the signed-in person a Slack DM and report exactly where it fails. */
export async function testSlackDm(): Promise<Step[]> {
  const me = await requireUser();
  const token = process.env.SLACK_BOT_TOKEN;
  const out: Step[] = [];
  if (!token) return [{ step: "Bot token", ok: false, detail: "SLACK_BOT_TOKEN is not set in Vercel → Settings → Environment Variables. Add it and redeploy." }];
  out.push({ step: "Bot token", ok: true, detail: `Set (${token.slice(0, 5)}…)` });

  const call = async (method: string, params: Record<string, string>, post = false) => {
    const url = `https://slack.com/api/${method}` + (post ? "" : `?${new URLSearchParams(params)}`);
    const res = await fetch(url, {
      method: post ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(post ? { "Content-Type": "application/json; charset=utf-8" } : {}) },
      body: post ? JSON.stringify(params) : undefined,
    });
    return (await res.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  const auth = await call("auth.test", {});
  if (!auth.ok) return [...out, { step: "Token works", ok: false, detail: `Slack said "${auth.error}". The token is wrong, expired or was revoked. Copy the Bot User OAuth Token (xoxb-…) from the Slack app's OAuth & Permissions page into Vercel.` }];
  out.push({ step: "Token works", ok: true, detail: `Bot "${auth.user}" in workspace "${auth.team}"` });

  const look = await call("users.lookupByEmail", { email: me.email });
  if (!look.ok) {
    const why = look.error === "missing_scope" ? `The app is missing the "${look.needed ?? "users:read.email"}" scope. Add it under OAuth & Permissions → Bot Token Scopes, click "Reinstall to Workspace", and copy the new xoxb token into Vercel.`
      : look.error === "users_not_found" ? `No Slack user has the email ${me.email}. Your Slack account must use the same email as your Google sign-in.`
      : `Slack said "${look.error}".`;
    return [...out, { step: `Find you in Slack (${me.email})`, ok: false, detail: why }];
  }
  out.push({ step: `Find you in Slack (${me.email})`, ok: true, detail: `Found ${look.user.real_name ?? look.user.name}` });
  await db.update(users).set({ slackUserId: look.user.id }).where(eq(users.id, me.id));

  const msg = await call("chat.postMessage", { channel: look.user.id, text: "✅ Test from revlogic Projects: notifications are working." }, true);
  if (!msg.ok) {
    const why = msg.error === "missing_scope" ? `The app is missing the "${msg.needed ?? "chat:write"}" scope. Add it, reinstall the app, and copy the new token into Vercel.`
      : msg.error === "messages_tab_disabled" ? "The app's Messages tab is off. In the Slack app settings → App Home, turn on \"Messages Tab\" and \"Allow users to send Slash commands and messages from the messages tab\"."
      : `Slack said "${msg.error}".`;
    return [...out, { step: "Send you a DM", ok: false, detail: why }];
  }
  return [...out, { step: "Send you a DM", ok: true, detail: "Sent. Check your Slack DMs from the app." }];
}
