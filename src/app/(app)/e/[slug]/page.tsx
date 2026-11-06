import Link from "next/link";
import { loadEngagement } from "@/lib/load";
import { Avatar } from "@/components/ui";
import { fmtDate, timeAgo, todayISO } from "@/lib/format";
import { EngagementSettings } from "@/components/engagement-settings";

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { e, tasks, members, contacts, activity, people, sources } = await loadEngagement(slug);
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const today = todayISO();
  const next = tasks.filter((t) => t.isMilestone && t.status !== "done").sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))[0];
  const risks = tasks.filter((t) => t.status !== "done" && (t.status === "blocked" || (t.dueDate && t.dueDate < today)));
  const name = (id?: string | null) => people.find((p) => p.id === id)?.name ?? "";
  return (
    <section className="flex flex-col gap-5">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        <div className="card p-4 flex flex-col gap-2.5">
          <span className="text-xs text-ink-3 font-medium">Progress</span>
          <span className="text-[28px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>{done} of {tasks.length} <span className="text-sm text-ink-3 font-normal" style={{ fontFamily: "var(--font-sans)" }}>tasks done</span></span>
          <div className="h-1.5 rounded bg-line-2 overflow-hidden"><div className="h-1.5 bg-mint-2" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="card p-4 flex flex-col gap-2">
          <span className="text-xs text-ink-3 font-medium">Next milestone</span>
          {next ? <>
            <span className="flex items-center gap-2.5"><span className="w-3 h-3 rotate-45 bg-mint-2 shrink-0" /><span className="text-[17px] font-semibold">{next.title}</span></span>
            <span className="text-[13px] text-ink-2">{next.dueDate ? `Due ${fmtDate(next.dueDate)}` : "No date"}{next.ownerId ? ` · ${name(next.ownerId)}` : ""}</span>
          </> : <span className="text-ink-3 text-[13px]">No open milestones.</span>}
        </div>
        <div className="card p-4 flex flex-col gap-2">
          <span className="text-xs text-ink-3 font-medium">Overdue or blocked</span>
          <span className="text-[28px] font-semibold text-red" style={{ fontFamily: "var(--font-display)" }}>{risks.length}</span>
          {risks.slice(0, 3).map((t) => <Link key={t.id} href={`/e/${e.slug}/plan?task=${t.id}`} className="text-[13px] no-underline">{t.title}</Link>)}
        </div>
        <div className="card p-4 flex flex-col gap-2.5">
          <span className="text-xs text-ink-3 font-medium">Team</span>
          <div className="flex">{members.map(({ u }) => <span key={u.id} className="-mr-2 rounded-full border-2 border-panel"><Avatar name={u.name} src={u.avatarUrl} size={32} /></span>)}</div>
          <span className="text-[13px] text-ink-2">{members.length} internal · {contacts.length} client contacts</span>
        </div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
        <div className="card px-5 py-4">
          <h2 className="m-0 mb-3 text-[15px] font-semibold">Recent activity</h2>
          {activity.length === 0 && <p className="text-ink-3 text-[13px]">Nothing yet.</p>}
          {activity.map((a) => {
            const actor = people.find((p) => p.id === a.actorId);
            return (
              <div key={a.id} className="flex items-start gap-3 py-2.5 border-t border-line-2">
                {actor ? <Avatar name={actor.name} src={actor.avatarUrl} size={28} /> : <span className="w-7 h-7 rounded-full bg-[#373a39] shrink-0" />}
                <div className="flex-1 min-w-0 leading-snug"><span className="font-medium">{actor?.name ?? "Sync"}</span> {a.summary}</div>
                <span className="text-xs text-ink-3 whitespace-nowrap">{timeAgo(a.createdAt)}</span>
              </div>
            );
          })}
        </div>
        <EngagementSettings e={e} sources={sources} />
      </div>
    </section>
  );
}
