const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(d?: string | Date | null) {
  if (!d) return "";
  const iso = typeof d === "string" ? d : d.toISOString();
  const [y, m, day] = iso.slice(0, 10).split("-").map(Number);
  const thisYear = new Date().getFullYear();
  return `${MONTHS[m - 1]} ${day}${y !== thisYear ? `, ${y}` : ""}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(due?: string | null, status?: string) {
  return !!due && status !== "done" && due < todayISO();
}

export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

const AVATAR_TONES = [
  ["#1F3A2C", "#8BE3B7"], ["#362B45", "#C9A6F2"], ["#43361F", "#F2C27B"], ["#1F3340", "#8CC8EE"], ["#452326", "#FF8A80"],
];
export function avatarTone(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length]!;
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function timeAgo(d: Date) {
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return fmtDate(d);
}
