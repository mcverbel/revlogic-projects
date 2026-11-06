"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ slug, counts }: { slug: string; counts: { plan: number; suggested: number; people: number; docs: number } }) {
  const p = usePathname();
  const base = `/e/${slug}`;
  const tabs = [
    { href: base, label: "Overview", count: null, on: p === base },
    { href: `${base}/plan`, label: "Plan", count: counts.plan, on: p.startsWith(`${base}/plan`) },
    { href: `${base}/suggested`, label: "Suggested", count: counts.suggested, on: p.startsWith(`${base}/suggested`), badge: counts.suggested > 0 },
    { href: `${base}/people`, label: "People", count: counts.people, on: p.startsWith(`${base}/people`) },
    { href: `${base}/docs`, label: "Docs", count: counts.docs, on: p.startsWith(`${base}/docs`) },
  ];
  return (
    <nav aria-label="Engagement sections" className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.on ? "page" : undefined}
          className={`min-h-11 px-3.5 inline-flex items-center gap-1.5 no-underline text-[14px] ${t.on ? "text-ink font-semibold shadow-[inset_0_-2px_0_#7fdcae]" : "text-ink-2 hover:text-ink"}`}>
          {t.label}
          {t.count !== null && (t.badge
            ? <span className="text-[11px] px-1.5 rounded-full bg-mint text-mint-ink font-semibold">{t.count}</span>
            : <span className="text-xs text-ink-3">{t.count}</span>)}
        </Link>
      ))}
    </nav>
  );
}
