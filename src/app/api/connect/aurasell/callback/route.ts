import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { AURASELL } from "@/lib/sources/aurasell";
import { appUrl } from "@/lib/app-url";

export async function GET(req: NextRequest) {
  const app = appUrl();
  const fail = (why: string) => NextResponse.redirect(new URL(`/connections?error=aurasell&why=${encodeURIComponent(why)}`, app));
  const session = await auth();
  const jar = await cookies();
  const code = req.nextUrl.searchParams.get("code");
  const err = req.nextUrl.searchParams.get("error_description") ?? req.nextUrl.searchParams.get("error");
  if (err) return fail(err);
  if (!session?.user?.id || !code || req.nextUrl.searchParams.get("state") !== jar.get("as_state")?.value) return fail("state");
  const res = await fetch(AURASELL.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: AURASELL.clientId(), code,
      redirect_uri: `${app}/api/connect/aurasell/callback`, code_verifier: jar.get("as_verifier")?.value ?? "",
    }),
  });
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!j.access_token) return fail(j.error_description ?? j.error ?? "token");
  await db.delete(connections).where(and(eq(connections.userId, session.user.id), eq(connections.provider, "aurasell")));
  await db.insert(connections).values({
    scope: "user", userId: session.user.id, provider: "aurasell",
    encryptedToken: encrypt(j.access_token), encryptedRefreshToken: j.refresh_token ? encrypt(j.refresh_token) : null,
    expiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000),
  });
  jar.delete("as_verifier");
  jar.delete("as_state");
  return NextResponse.redirect(new URL("/connections?connected=aurasell", app));
}
