"use client";
import { useState, useTransition } from "react";
import { REVS } from "@/lib/constants";
import { addRevs, addRevTasks, removeRev } from "@/actions/revs";
import { Icon } from "./ui";
import { todayISO } from "@/lib/format";

export type FrameworkCounts = Record<string, { milestones: number; tasks: number }>;

const size = (c?: { milestones: number; tasks: number }) => (c ? `${c.milestones} milestones · ${c.tasks} tasks` : "No framework yet");

/** Toggle chips for picking REVs. `name` makes them form fields; `onChange` makes them controlled. */
function RevChips({ counts, value, onChange, exclude = [], name }: {
  counts: FrameworkCounts; value: string[]; onChange: (v: string[]) => void; exclude?: string[]; name?: string;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
      {REVS.filter((r) => !exclude.includes(r.id)).map((r) => {
        const on = value.includes(r.id);
        return (
          <label key={r.id} className={`flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 cursor-pointer ${on ? "border-mint-2 bg-[#23392f]" : "border-line hover:border-line-3"}`}>
            <input type="checkbox" name={name} value={r.id} checked={on} className="mt-1 accent-[#8be3b7]"
              onChange={(e) => onChange(e.target.checked ? [...value, r.id] : value.filter((v) => v !== r.id))} />
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[14px] font-semibold text-ink">{r.label}</span>
              <span className="text-xs text-ink-3">{r.blurb}</span>
              <span className={`text-xs ${counts[r.id] ? "text-mint-2" : "text-ink-3"}`}>{size(counts[r.id])}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** On the new-engagement form. */
export function RevField({ counts }: { counts: FrameworkCounts }) {
  const [picked, setPicked] = useState<string[]>([]);
  const missing = picked.filter((r) => !counts[r]);
  return (
    <fieldset className="col-span-full flex flex-col gap-2.5 border-0 p-0 m-0">
      <legend className="text-[13px] text-ink-2 mb-1.5">revlogic services (REVs) <span className="text-ink-3">· pick one or more</span></legend>
      <RevChips counts={counts} value={picked} onChange={setPicked} name="revs" />
      <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
        <input type="checkbox" name="withTasks" defaultChecked className="accent-[#8be3b7]" />
        Add each REV&apos;s framework tasks to the plan, dated from the start date (or today)
      </label>
      {missing.length > 0 && <span className="text-xs text-ink-3">{missing.join(", ")} {missing.length === 1 ? "has" : "have"} no framework loaded yet. You can add the tasks later from the project header.</span>}
    </fieldset>
  );
}

/** In the engagement header: the REV chips, plus adding a REV or its framework tasks later. */
export function EngagementRevs({ engagementId, revs, counts, startDate }: {
  engagementId: string; revs: { rev: string; frameworkAppliedAt: Date | null }[]; counts: FrameworkCounts; startDate: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [from, setFrom] = useState(startDate && startDate > todayISO() ? startDate : todayISO());
  const [withTasks, setWithTasks] = useState(true);
  const [note, setNote] = useState("");
  const [tasksFor, setTasksFor] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const have = revs.map((r) => r.rev);

  const add = () => start(async () => {
    const r = await addRevs(engagementId, picked, { startDate: from, withTasks });
    setNote(withTasks ? `Added ${picked.join(", ")}${r.added ? ` with ${r.added} tasks` : ""}.` : `Added ${picked.join(", ")}.`);
    setPicked([]); setOpen(false);
  });

  return (
    <>
      {revs.map(({ rev, frameworkAppliedAt }) => {
        const canAddTasks = !frameworkAppliedAt && !!counts[rev];
        return (
          <span key={rev} className="chip gap-1.5">
            {rev}
            {canAddTasks && (
              <button className="text-mint-2 cursor-pointer text-xs underline" disabled={pending} title={`Add the ${rev} framework tasks to the plan`}
                onClick={() => { setTasksFor(rev); setOpen(false); }}>
                + tasks
              </button>
            )}
            <button aria-label={`Remove ${rev}`} className="text-ink-3 hover:text-red cursor-pointer" disabled={pending}
              onClick={() => confirm(`Remove ${rev} from this project? Its tasks stay on the plan.`) && start(() => removeRev(engagementId, rev))}>×</button>
          </span>
        );
      })}
      <span className="inline-flex">
      <button className="chip gap-1 cursor-pointer hover:border-line-3" onClick={() => { setOpen((o) => !o); setTasksFor(null); }} aria-expanded={open}>
        <Icon name="plus" size={13} />{have.length ? "REV" : "Add REV"}
      </button>
      {tasksFor && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-start justify-center p-4 pt-[12vh]" onClick={(e) => e.target === e.currentTarget && setTasksFor(null)}>
        <div role="dialog" aria-modal="true" aria-label={`Add ${tasksFor} tasks`} className="w-full max-w-3xl max-h-[85vh] overflow-auto shadow-[0_12px_40px_rgba(0,0,0,0.45)] card p-4 flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
          <span className="text-[15px] font-semibold text-ink">Add the {tasksFor} framework</span>
          <span className="text-ink-3">{size(counts[tasksFor])}</span>
          <label className="inline-flex items-center gap-2">starting
            <input type="date" className="field w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Framework start date" /></label>
          <span className="ml-auto flex gap-2">
            <button className="btn btn-ghost" onClick={() => setTasksFor(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={pending || !from} onClick={() => start(async () => {
              const r = await addRevTasks(engagementId, tasksFor, from);
              setNote(`Added ${r.added} ${tasksFor} tasks.`); setTasksFor(null);
            })}>{pending ? "Adding…" : "Add tasks"}</button>
          </span>
        </div>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-start justify-center p-4 pt-[12vh]" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div role="dialog" aria-modal="true" aria-label="Add REVs" className="w-full max-w-3xl max-h-[85vh] overflow-auto shadow-[0_12px_40px_rgba(0,0,0,0.45)] card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold text-ink">Add REVs to this project</span>
            <button aria-label="Close" className="btn btn-quiet px-2" onClick={() => setOpen(false)}><Icon name="x" size={16} /></button>
          </div>
          {have.length >= REVS.length ? <span className="text-[13px] text-ink-3">Every REV is already on this project.</span> : (
            <>
              <RevChips counts={counts} value={picked} onChange={setPicked} exclude={have} />
              <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={withTasks} onChange={(e) => setWithTasks(e.target.checked)} className="accent-[#8be3b7]" />Add framework tasks</label>
                {withTasks && <label className="inline-flex items-center gap-2">starting
                  <input type="date" className="field w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Framework start date" /></label>}
                <button className="btn btn-primary ml-auto" disabled={!picked.length || pending} onClick={add}>{pending ? "Adding…" : picked.length ? `Add ${picked.length} REV${picked.length === 1 ? "" : "s"}` : "Add REVs"}</button>
              </div>
              <span className="text-xs text-ink-3">Kickoff tasks already on the plan aren&apos;t added twice. Framework tasks start unassigned, so no one gets a Slack message.</span>
            </>
          )}
        </div>
        </div>
      )}
      </span>
      {note && <span className="text-xs text-mint-2">{note}</span>}
    </>
  );
}
