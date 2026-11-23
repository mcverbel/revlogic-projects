import { registerClient } from "@/lib/oauth";
import { json, preflight } from "@/lib/oauth-http";

/** Dynamic client registration (RFC 7591): ChatGPT and Claude register themselves before the first sign-in. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await registerClient(body);
  return "error" in out ? json(out, 400) : json(out, 201);
}
export const OPTIONS = preflight;
