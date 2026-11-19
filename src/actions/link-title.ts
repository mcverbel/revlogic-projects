"use server";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { requireUser } from "@/lib/session";
import { driveFileId, driveMetadata } from "@/lib/sources/google";

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(10|127|192\.168|169\.254)\./i];

/** Only fetch public web pages, never the app's own network. */
async function isPublic(host: string) {
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) return false;
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  return addrs.length > 0 && addrs.every((a) => !PRIVATE.some((r) => r.test(a)));
}

const decode = (s: string) => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();

/** Strip the site name Google, Figma and others append ("Deck - Google Slides"). */
const tidy = (t: string) => t.replace(/\s+[-–|]\s+(Google (Docs|Sheets|Slides|Drive)|Figma|Canva|Notion|Lovable|Loom|YouTube)$/i, "").slice(0, 120);

/**
 * The name of what a link points to: the file name for Google Drive links (with the viewer's Google access),
 * otherwise the page title. null when it can't be read (private page, sign-in wall, timeout).
 */
export async function linkTitle(raw: string): Promise<string | null> {
  const me = await requireUser();
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;

  if (/(^|\.)google\.com$/i.test(url.hostname) && driveFileId(url.href)) {
    const meta = await driveMetadata(me.id, url.href).catch(() => null);
    if (meta?.name) return meta.name;
  }

  try {
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
      if (!(await isPublic(current.hostname))) return null;
      const res = await fetch(current, {
        redirect: "manual", signal: AbortSignal.timeout(4000),
        headers: { "user-agent": "Mozilla/5.0 (revlogic Projects link preview)", accept: "text/html" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current);
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
      const reader = res.body?.getReader();
      let html = "";
      while (reader && html.length < 200_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += new TextDecoder().decode(value);
        if (/<\/head>/i.test(html)) break;
      }
      reader?.cancel().catch(() => {});
      const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
      const title = og ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      const t = title ? tidy(decode(title)) : "";
      // Sign-in pages aren't the file's name.
      return t && !/^(sign in|log ?in|google drive: sign-in|access denied)/i.test(t) ? t : null;
    }
  } catch { /* unreachable or slow: no name */ }
  return null;
}
