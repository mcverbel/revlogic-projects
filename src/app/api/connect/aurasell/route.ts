import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { auth } from "@/auth";
import { AURASELL } from "@/lib/sources/aurasell";

export async function GET() {
  const session = await auth();
  const app = process.env.APP_URL ?? "http://localhost:3000";
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login", app));
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: app.startsWith("https"), path: "/api/connect/aurasell", maxAge: 600 };
  jar.set("as_verifier", verifier, opts);
  jar.set("as_state", state, opts);
  const url = new URL(AURASELL.authorize);
  url.search = new URLSearchParams({
    response_type: "code", client_id: AURASELL.clientId(), redirect_uri: `${app}/api/connect/aurasell/callback`,
    scope: AURASELL.scope, resource: AURASELL.mcpUrl(), audience: AURASELL.mcpUrl(), state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  }).toString();
  return NextResponse.redirect(url);
}
