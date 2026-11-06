import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { encrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const session = await auth();
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!session?.user?.id || !code || state !== session.user.id) return NextResponse.redirect(new URL("/connections?error=slack", process.env.APP_URL));
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!, client_secret: process.env.SLACK_CLIENT_SECRET!, code,
      redirect_uri: `${process.env.APP_URL}/api/connect/slack/callback`,
    }),
  });
  const j = (await res.json()) as { ok: boolean; authed_user?: { access_token?: string } };
  const token = j.authed_user?.access_token;
  if (!j.ok || !token) return NextResponse.redirect(new URL("/connections?error=slack", process.env.APP_URL));
  await db.delete(connections).where(and(eq(connections.userId, session.user.id), eq(connections.provider, "slack_user")));
  await db.insert(connections).values({ scope: "user", userId: session.user.id, provider: "slack_user", encryptedToken: encrypt(token) });
  return NextResponse.redirect(new URL("/connections?connected=slack", process.env.APP_URL));
}
