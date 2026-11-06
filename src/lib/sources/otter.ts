/**
 * Otter (per-person connection).
 *
 * IMPORTANT: confirm the endpoint paths and auth for revlogic's Otter plan before going live.
 * Only transcripts whose title or participants match the engagement's client are used,
 * and only for calls Aurasell did not record.
 */
import type { SourceItem } from "./types";

type Speech = { id: string; title: string; start_time: string; summary?: string; transcript?: string; url?: string; participants?: string[] };

export async function otterItems(accessToken: string, match: { clientName: string; domains: string[] }, since: Date): Promise<SourceItem[]> {
  const base = process.env.OTTER_API_BASE_URL?.replace(/\/$/, "");
  if (!base) return [];
  // TODO(confirm path): list conversations since a date
  const r = await fetch(`${base}/speeches?created_after=${since.toISOString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Otter ${r.status}`);
  const { speeches } = (await r.json()) as { speeches: Speech[] };
  const name = match.clientName.toLowerCase();
  return speeches
    .filter((s) => s.title.toLowerCase().includes(name) || s.participants?.some((p) => match.domains.some((d) => p.toLowerCase().endsWith(d))))
    .map((s) => ({
      provider: "otter" as const, externalId: s.id, title: s.title, url: s.url, occurredAt: s.start_time,
      participants: s.participants ?? [], text: `Meeting: ${s.title}\nSummary: ${s.summary ?? ""}\n\nTranscript:\n${(s.transcript ?? "").slice(0, 12000)}`,
    }));
}
