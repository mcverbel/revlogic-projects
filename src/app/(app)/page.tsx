import Link from "next/link";
import { requireUser } from "@/lib/session";
import { myWork, mySuggestionCount } from "@/lib/queries";
import { StatusPill, Empty } from "@/components/ui";
import { fmtDate, isOverdue, todayISO } from "@/lib/format";
import { MyPrioritySelect } from "@/components/my-priority";

export default async function MyWorkPage() {
  const me = await requireUser();
  const rows = (await myWork(me.id)).filter((r) => r.t.status !== "done");
  const suggestions = await mySuggestionCount(me.id);
  const today = todayISO();
  const week = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const groups = [
    { label: "Overdue", items: rows.filter((r) => r.t.dueDate && r.t.dueDate < today) },
    { label: "This week", items: rows.filter((r) => r.t.dueDate && r.t.dueDate >= today && r.t.dueDate <= week) },
    { label: "Later", items: rows.filter((r) => r.t.dueDate && r.t.dueDate > week) },
    { label: "No due date", items: rows.filter((r) => !r.t.dueDate) },
  ];
  const hour = new Date().getHours();
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[28px] font-medium tracking-tight">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, {me.name.split(" ")[0]}</h1>
        <p className="m-0 text-ink-2">{rows.length} open tasks across your engagements, sorted by your priority, then due date.</p>
      </header>
      {suggestions > 0 && (
        <div className="card border-[#2f6b4d] px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <span><span className="pill bg-mint text-mint-ink mr-2">{suggestions}</span>suggested tasks name you as owner and are waiting for review.</span>
        </div>
      )}
      {groups.map((g) => g.items.length > 0 && (
        <section key={g.label} className="card overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(0,1fr)_220px_110px_120px_130px] gap-3 px-4 py-3 text-xs font-semibold text-ink-3 border-b border-line">
              <span>{g.label} · {g.items.length}</span><span>Engagement</span><span>Due</span><span>Status</span><span>My priority</span>
            </div>
            {g.items.map(({ t, e, client, myPriority }) => (
              <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_220px_110px_120px_130px] gap-3 px-4 py-2.5 items-center border-b border-line-2 last:border-0">
                <Link href={`/e/${e.slug}/plan?task=${t.id}`} className="text-ink no-underline hover:text-mint text-[14px]">{t.title}</Link>
                <span className="text-ink-2 truncate">{client.name} · {e.name}</span>
                <span className={isOverdue(t.dueDate, t.status) ? "text-red font-semibold" : "text-ink-2"}>{fmtDate(t.dueDate) || "—"}</span>
                <span><StatusPill status={t.status} /></span>
                <MyPrioritySelect taskId={t.id} value={myPriority ?? ""} />
              </div>
            ))}
          </div>
        </section>
      ))}
      {rows.length === 0 && <div className="card"><Empty>Nothing assigned to you yet. Tasks you own or are tagged on show up here.</Empty></div>}
    </>
  );
}
