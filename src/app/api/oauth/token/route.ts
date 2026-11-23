import { exchange, oauthLog } from "@/lib/oauth";
import { formOrJson, json, preflight } from "@/lib/oauth-http";

/** Client credentials sent as an HTTP Basic header (client_secret_basic). */
function basicAuth(req: Request) {
  const h = req.headers.get("authorization");
  if (!h?.toLowerCase().startsWith("basic ")) return null;
  try {
    const raw = Buffer.from(h.slice(6).trim(), "base64").toString("utf8");
    const i = raw.indexOf(":");
    return { id: decodeURIComponent(raw.slice(0, i < 0 ? raw.length : i)), secret: decodeURIComponent(i < 0 ? "" : raw.slice(i + 1)) };
  } catch { return null; }
}

export async function POST(req: Request) {
  const p = await formOrJson(req);
  const basic = basicAuth(req);
  const out = await exchange(p, basic);
  const detail = { grant: p.get("grant_type"), client: basic?.id || p.get("client_id"), clientAuth: basic ? "basic" : p.get("client_secret") ? "post" : "none", ua: req.headers.get("user-agent")?.slice(0, 80) };
  if ("error" in out) {
    oauthLog("token failed", { ...detail, error: out.error, why: out.error_description });
    return json(out, out.error === "invalid_client" ? 401 : 400);
  }
  oauthLog("token issued", detail);
  return json(out);
}
export const OPTIONS = preflight;
