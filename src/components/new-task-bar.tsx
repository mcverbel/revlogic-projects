"use client";

import { useState, useTransition } from "react";
import { createTask } from "@/actions/tasks";
import { PersonPicker, PeoplePicker, type PickPerson } from "./person-picker";
import { Icon } from "./ui";
import { TASK_STATUSES, PRIORITIES } from "@/lib/constants";

type Phase = { id: string; name: string };
type Status = (typeof TASK_STATUSES)[number]["id"];
type Priority = (typeof PRIORITIES)[number]["id"];

const EMPTY = {
  title: "", ownerId: null as string | null, dueDate: "", startDate: "",
  assigneeIds: [] as string[], phaseId: "", status: "not_started" as Status, priority: "medium" as Priority,
  notes: "", isMilestone: false, waitingOnClient: false,
};

/** Add-task bar: name, owner and due date inline; "More details" opens the rest. */
export function NewTaskBar({ engagementId, phases, people }: { engagementId: string; phases: Phase[]; people: PickPerson[] }) {
  const [f, setF] = useState({ ...EMPTY, phaseId: phases.at(-1)?.id ?? "" });
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const submit = () => {
    if (!f.title.trim()) return;
    setError("");
    start(async () => {
      try {
        await createTask(engagementId, {
          title: f.title, ownerId: f.ownerId, dueDate: f.dueDate || null, startDate: f.startDate || null,
          phaseId: f.phaseId || null, assigneeIds: f.assigneeIds, status: f.status, priority: f.priority,
          notes: f.notes || null, isMilestone: f.isMilestone, waitingOnClient: f.waitingOnClient,
        });
        // Keep the phase, owner and due date so several tasks for the same person/phase are quick to add
        setF((x) => ({ ...EMPTY, phaseId: x.phaseId, ownerId: x.ownerId, dueDate: x.dueDate }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add the task");
      }
    });
  };

  return (
    <form className="card p-3 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="flex flex-wrap items-center gap-2">
        <input className="field flex-1 min-w-[240px]" placeholder="Task name" value={f.title} onChange={(e) => set({ title: e.target.value })} aria-label="New task name" />
        <PersonPicker people={people} value={f.ownerId} onChange={(id) => set({ ownerId: id })} noneLabel="Owner" label="Owner" className="w-[200px]" />
        <label className="relative">
          <span className="sr-only">Due date</span>
          <input type="date" className="field w-[160px]" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} title="Due date" />
        </label>
        <button type="button" className={`btn ${more ? "btn-ghost border-mint-2 text-mint" : "btn-ghost"} min-h-[38px]`} aria-expanded={more} onClick={() => setMore(!more)}>
          <Icon name="chevron" size={15} className={more ? "rotate-180" : ""} />More details
        </button>
        <button className="btn btn-primary min-h-[38px]" disabled={!f.title.trim() || pending}>
          <Icon name="plus" size={16} />{pending ? "Adding…" : "Add task"}
        </button>
      </div>

      {more && (
        <div className="grid gap-3 border-t border-line-2 pt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div className="flex flex-col gap-1 text-[13px] text-ink-2 col-span-full">Assignees
            <PeoplePicker people={people} value={f.assigneeIds} exclude={f.ownerId ? [f.ownerId] : []} onChange={(ids) => set({ assigneeIds: ids })} />
          </div>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">Phase
            <select className="field" value={f.phaseId} onChange={(e) => set({ phaseId: e.target.value })}>
              <option value="">No phase</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">Status
            <select className="field" value={f.status} onChange={(e) => set({ status: e.target.value as Status })}>
              {TASK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">Priority
            <select className="field" value={f.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">Start date
            <input type="date" className="field" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-2 col-span-full">Notes
            <textarea className="field min-h-[72px] py-2" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Context, links, anything the team should know" />
          </label>
          <div className="flex flex-wrap gap-5 col-span-full text-[13px]">
            <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={f.isMilestone} onChange={(e) => set({ isMilestone: e.target.checked })} />Milestone</label>
            <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4" checked={f.waitingOnClient} onChange={(e) => set({ waitingOnClient: e.target.checked })} />Waiting on client</label>
          </div>
        </div>
      )}
      {error && <p className="m-0 text-[13px] text-red">{error}</p>}
    </form>
  );
}
