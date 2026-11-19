// Notes and comments can hold links as [text](https://…). Bare URLs still work and show shortened.
export const TOKEN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;
export const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim()) || /^www\.\S+\.\S+$/i.test(s.trim());
export const withScheme = (s: string) => (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);

/** "drive.google.com/…/abc" instead of a 120-character URL. */
export function shortUrl(u: string) {
  try {
    const x = new URL(u);
    const host = x.hostname.replace(/^www\./, "");
    const path = x.pathname.replace(/\/$/, "");
    return path.length > 24 ? `${host}/…${path.slice(-14)}` : `${host}${path}`;
  } catch { return u; }
}

/** Plain text of a note: link text instead of [text](url). For one-line previews. */
export function plainText(s: string) {
  return s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1");
}

/** Slack wants <url|text>. */
export function toSlack(s: string) {
  return s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "<$2|$1>");
}
