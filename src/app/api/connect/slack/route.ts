import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appUrl } from "@/lib/app-url";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", appUrl()));
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID ?? "");
  url.searchParams.set("user_scope", "search:read,im:history,mpim:history");
  url.searchParams.set("redirect_uri", `${appUrl()}/api/connect/slack/callback`);
  url.searchParams.set("state", session.user.id);
  return NextResponse.redirect(url);
}
