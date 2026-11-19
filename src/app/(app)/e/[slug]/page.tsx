import Link from "next/link";
import { Suspense } from "react";
import { clientActivity } from "@/lib/client-activity";
import { ClientActivityCard } from "@/components/client-activity";
import { redirect } from "next/navigation";
import { isDesignBoard } from "@/lib/design-board";
import { loadEngagement } from "@/lib/load";
import { Avatar } from "@/components/ui";
import { fmtDate, timeAgo, todayISO } from "@/lib/format";
import { EngagementSettings } from "@/components/engagement-settings";
import { openIssues } from "@/lib/notes";
import { categoryOf } from "@/lib/constants";

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (isDesignBoard(slug)) redirect(`/e/${slug}/plan`);
  const { me, e, tasks, members, contacts, activity, people, sources } = await loadEngagement(slug);
  const hasNotes = categoryOf(e.category).section !== "creative";
  const issues = hasNotes ? await openIssues(e.id, me.id) : [];
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const today = todayISO();
  const next = tasks.filter((t) => t.isMilestone && t.status !== "done").sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))[0];
  const risks = tasks.filter((t) => t.status !== "done" && (t.status === "blocked" || (t.dueDate && t.dueDate < today)));
  const name = (id?: string | null) => people.find((p) => p.id === id)?.name ?? "";
  return (
    <section className="flex flex-col gap-5">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
        {hasNotes && (
          <div className="card p-4 flex flex-col gap-2">
            <span className="text-xs text-ink-3 font-medium">Open blockers</span>
            <span className="text-[28px] font-semibold" style={{ fontFamily: "var(--font-display)", color: issues.length ? "#ff8a80" : undefined }}>{issues.length}</span>
            {issues.slice(0, 3).map((n) => (
              <Link key={n.id} href={`/e/${e.slug}/notes?note=${n.id}`} className="text-[13px] no-underline">{n.title}{n.neededBy ? <span className="text-ink-3"> · due {fmtDate(n.neededBy)}</span> : null}</Link>
            ))}
            <Link href={`/e/${e.slug}/notes`} className="text-xs text-ink-3 no-underline hover:text-mint mt-auto">{issues.length ? "See all notes" : "Add a blocker or meeting notes"} →</Link>
          </div>
        )}
        {!hasNotes && <div className="card p-4 flex flex-col gap-2.5">
          <span className="text-xs text-ink-3 font-medium">Team</span>
          <div className="flex">{members.map(({ u }) => <span key={u.id} className="-mr-2 rounded-full border-2 border-panel"><Avatar name={u.name} src={u.avatarUrl} size={32} /></span>)}</div>
          <span className="text-[13px] text-ink-2">{members.length} internal · {contacts.length} client contacts</span>
        </div>}
      </div>
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 items-stretch">
        {/* Recent activity is as tall as Settings and scrolls, so it doesn't grow with every update. */}
        <div className="card px-5 py-4 flex flex-col min-w-0">
          <h2 className="m-0 mb-2 text-[15px] font-semibold">Recent activity</h2>
          <div className="relative flex-1 h-[360px] lg:h-auto"><div className="absolute inset-0 overflow-y-auto -mr-2 pr-2">
            {activity.length === 0 && <p className="text-ink-3 text-[13px]">Nothing yet.</p>}
            {activity.map((a, i) => {
              const actor = people.find((p) => p.id === a.actorId);
              return (
                <div key={a.id} className={`flex items-start gap-3 py-2.5 ${i ? "border-t border-line-2" : ""}`}>
                  {actor ? <Avatar name={actor.name} src={actor.avatarUrl} size={28} /> : <span className="w-7 h-7 rounded-full bg-[#373a39] shrink-0" />}
                  <div className="flex-1 min-w-0 leading-snug"><span className="font-medium">{actor?.name ?? "Sync"}</span> {a.summary}</div>
                  <span className="text-xs text-ink-3 whitespace-nowrap">{timeAgo(a.createdAt)}</span>
                </div>
              );
            })}
          </div></div>
        </div>
        <EngagementSettings e={e} sources={sources} isAdmin={me.role === "admin"} />
      </div>
      {hasNotes && (
        <Suspense fallback={<section className="card px-5 py-4 flex items-center gap-3"><span className="text-[15px] font-semibold">Client activity</span><span className="text-[13px] text-ink-3">Loading…</span></section>}>
          <ClientActivitySection engagementId={e.id} slug={e.slug} />
        </Suspense>
      )}
    </section>
  );
}

async function ClientActivitySection({ engagementId, slug }: { engagementId: string; slug: string }) {
  return <ClientActivityCard data={await clientActivity(engagementId)} slug={slug} />;
}
