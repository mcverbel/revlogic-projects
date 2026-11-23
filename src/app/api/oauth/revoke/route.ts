import { revoke } from "@/lib/oauth";
import { formOrJson, json, preflight } from "@/lib/oauth-http";

export async function POST(req: Request) {
  const token = (await formOrJson(req)).get("token");
  if (token) await revoke(token);
  return json({});
}
export const OPTIONS = preflight;
