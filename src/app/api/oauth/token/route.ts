import { exchange } from "@/lib/oauth";
import { formOrJson, json, preflight } from "@/lib/oauth-http";

export async function POST(req: Request) {
  const out = await exchange(await formOrJson(req));
  return "error" in out ? json(out, 400) : json(out);
}
export const OPTIONS = preflight;
