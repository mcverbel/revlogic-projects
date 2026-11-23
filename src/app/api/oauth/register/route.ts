import { oauthLog, registerClient } from "@/lib/oauth";
import { json, preflight } from "@/lib/oauth-http";

/** Dynamic client registration (RFC 7591): ChatGPT and Claude register themselves before the first sign-in. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await registerClient(body);
  const detail = { name: body.client_name, redirects: body.redirect_uris, method: body.token_endpoint_auth_method, ua: req.headers.get("user-agent")?.slice(0, 80) };
  if ("error" in out) { oauthLog("register failed", { ...detail, error: out.error, why: out.error_description }); return json(out, 400); }
  oauthLog("registered", { ...detail, client: out.client_id });
  return json(out, 201);
}
export const OPTIONS = preflight;
