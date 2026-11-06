import { avatarTone, initials } from "@/lib/format";

export function Avatar({ name, src, size = 26 }: { name: string; src?: string | null; size?: number }) {
  const [bg, fg] = avatarTone(name);
  if (src) return <img src={src} alt="" title={name} width={size} height={size} referrerPolicy="no-referrer" className="rounded-full shrink-0 object-cover" style={{ width: size, height: size, background: bg }} />;
  return (
    <span title={name} className="inline-flex items-center justify-center rounded-full shrink-0 font-semibold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.max(9, size * 0.4) }}>
      {initials(name)}
    </span>
  );
}

const STATUS_TONE: Record<string, [string, string]> = {
  not_started: ["#373a39", "#c3c7c5"], in_progress: ["#23392f", "#8be3b7"], blocked: ["#452326", "#ff8a80"],
  in_review: ["#43361f", "#f2c27b"], done: ["#1f3a2c", "#7fdcae"],
};
const STATUS_LABEL: Record<string, string> = { not_started: "Not started", in_progress: "In progress", blocked: "Blocked", in_review: "In review", done: "Done" };
export function StatusPill({ status }: { status: string }) {
  const [bg, fg] = STATUS_TONE[status] ?? STATUS_TONE.not_started!;
  return <span className="pill" style={{ background: bg, color: fg }}>{STATUS_LABEL[status] ?? status}</span>;
}
export const statusTone = STATUS_TONE;

const PRIORITY_TONE: Record<string, string> = { low: "#a3a8a6", medium: "#8be3b7", high: "#f2c27b", urgent: "#ff8a80" };
export function PriorityDot({ priority }: { priority: string }) {
  const c = PRIORITY_TONE[priority] ?? "#a3a8a6";
  return <span className="inline-flex items-center gap-1.5 capitalize" style={{ color: c }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{priority}</span>;
}

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  briefcase: <><rect x="2.5" y="7" width="19" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  building: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9.5 9h1M13.5 9h1M9.5 13h1M13.5 13h1M9.5 17h1M13.5 17h1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  link: <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
  plug: <><path d="M9 7H6a4 4 0 0 0 0 8h3" /><path d="M15 7h3a4 4 0 0 1 0 8h-3" /><path d="M8 11h8" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  spark: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
};
export function Icon({ name, size = 20, color = "currentColor", className }: { name: keyof typeof ICONS | string; size?: number; color?: string; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {ICONS[name]}
    </svg>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-ink-3 text-[13px]">{children}</div>;
}
