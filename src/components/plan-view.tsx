"use client";

import { RichNotes } from "./rich-text";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { FullTask } from "@/lib/queries";
import type { phases as phasesT, users as usersT } from "@/db/schema";
import { PersonPicker, PeoplePicker } from "./person-picker";
import { NewTaskBar } from "./new-task-bar";
import { TaskComments, type Viewer } from "./task-comments";
import { createTask, updateTask, createPhase, setAssignees, setMyPriority, addTaskLink, removeTaskLink, deleteTask } from "@/actions/tasks";
import { Avatar, StatusPill, PriorityDot, Icon, Empty, statusTone } from "./ui";
import { TASK_STATUSES, PRIORITIES, MY_PRIORITIES, CONTENT_FORMATS } from "@/lib/constants";
import { fmtDate, isOverdue, todayISO } from "@/lib/format";

type Phase = typeof phasesT.$inferSelect;
type User = typeof usersT.$inferSelect;

/** Page icon for tasks marked Content. */
function ContentIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`} style={{ color: "#c9a6f2" }}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" />
    </svg>
  );
}
const formatLabel = (id?: string | null) => CONTENT_FORMATS.find((f) => f.id === id)?.label ?? null;
type Filter = "all" | "milestone" | "content";

const GRID = "grid grid-cols-[28px_minmax(240px,1fr)_210px_130px_140px_110px_minmax(180px,240px)_60px] gap-3";

export function PlanView({ engagementId, tasks, phases, people, me }: { engagementId: string; tasks: FullTask[]; phases: Phase[]; people: User[]; me: Viewer }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [view, setView] = useState<"list" | "timeline">((search.get("view") as "timeline") ?? "list");
  const [filter, setFilter] = useState<Filter>("all");
  const [fmt, setFmt] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPhase, setNewPhase] = useState("");
  const [pending, start] = useTransition();
  const [addingFor, setAddingFor] = useState<string | null>(null);
  // Which parents are folded. Remembered per project in this browser; everything starts open.
  const storeKey = `plan-collapsed:${engagementId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => { try { setCollapsed(new Set(JSON.parse(localStorage.getItem(storeKey) ?? "[]"))); } catch { /* storage unavailable */ } }, [storeKey]);
  const toggle = (id: string, open?: boolean) => setCollapsed((c) => {
    const n = new Set(c);
    if (open ?? n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem(storeKey, JSON.stringify([...n])); } catch { /* storage unavailable */ }
    return n;
  });
  const openId = search.get("task");
  const open = tasks.find((t) => t.id === openId) ?? null;
  const setOpen = (id: string | null) => router.replace(id ? `${pathname}?task=${id}${view === "timeline" ? "&view=timeline" : ""}` : `${pathname}${view === "timeline" ? "?view=timeline" : ""}`, { scroll: false });

  const matches = (t: FullTask) => filter === "all" || (filter === "milestone" ? t.isMilestone : t.isContent && (!fmt || t.contentFormat === fmt));
  const kids = useMemo(() => {
    const m = new Map<string, FullTask[]>();
    for (const t of tasks) if (t.parentTaskId) m.set(t.parentTaskId, [...(m.get(t.parentTaskId) ?? []), t]);
    return m;
  }, [tasks]);
  const isTop = (t: FullTask) => !t.parentTaskId || !tasks.some((p) => p.id === t.parentTaskId);
  const childrenOf = (t: FullTask) => (kids.get(t.id) ?? []).filter((c) => filter === "all" || matches(c));
  // A parent stays visible when any of its subtasks match the filter, so they're never orphaned.
  const shownTop = tasks.filter((t) => isTop(t) && (matches(t) || childrenOf(t).length > 0));
  const visible = shownTop.flatMap((t) => [t, ...childrenOf(t)]);
  const groups = useMemo(() => {
    const g = phases.map((p) => ({ id: p.id, name: p.name, tasks: shownTop.filter((t) => t.phaseId === p.id) }));
    const none = shownTop.filter((t) => !t.phaseId || !phases.some((p) => p.id === t.phaseId));
    if (none.length || !phases.length) g.push({ id: "none", name: phases.length ? "No phase" : "Tasks", tasks: none });
    return g;
  }, [phases, shownTop]); // eslint-disable-line react-hooks/exhaustive-deps
  const person = (id?: string | null) => people.find((p) => p.id === id);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="seg">
          <button aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
          <button aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>Timeline</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="seg" role="group" aria-label="Show">
            <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
            <button aria-pressed={filter === "milestone"} onClick={() => setFilter("milestone")}><span aria-hidden className="inline-block w-2 h-2 rotate-45 bg-mint-2 mr-1.5" />Milestones</button>
            <button aria-pressed={filter === "content"} onClick={() => setFilter("content")}><span className="inline-flex align-[-2px] mr-1"><ContentIcon size={13} /></span>Content</button>
          </div>
          {filter === "content" && <select className="field min-h-11 w-40" aria-label="Content format" value={fmt} onChange={(e) => setFmt(e.target.value)}>
            <option value="">All formats</option>{CONTENT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { await createPhase(engagementId, newPhase); setNewPhase(""); }); }}>
            <input className="field w-40" placeholder="New phase" value={newPhase} onChange={(e) => setNewPhase(e.target.value)} aria-label="New phase name" />
            <button className="btn btn-ghost" disabled={!newPhase.trim() || pending}>Add phase</button>
          </form>
        </div>
      </div>

      <NewTaskBar engagementId={engagementId} phases={phases} people={people} />

      {view === "list" ? (
        <div className="card overflow-x-auto">
          <div className="min-w-[1240px]">
            <div className={`${GRID} px-4 py-3 text-xs font-semibold text-ink-3 border-b border-line`}>
              <span /><span>Task</span><span>Owner + assignees</span><span>Status</span><span>Due</span><span>Priority</span><span>Notes</span><span>Links</span>
            </div>
            {groups.map((g) => (
              <div key={g.id}>
                <div className="px-4 pt-3 pb-2 bg-panel-2 border-b border-line-2 text-xs font-semibold text-ink-2">{g.name} <span className="text-ink-3 font-normal">· {g.tasks.length}</span></div>
                {g.tasks.length === 0 && <Empty>{filter === "all" ? "No tasks in this phase." : "Nothing here matches."}</Empty>}
                {g.tasks.map((t) => {
                  const all = kids.get(t.id) ?? [];
                  const subs = childrenOf(t);
                  const expanded = !collapsed.has(t.id);
                  return (
                    <div key={t.id}>
                      <TaskRow t={t} people={people} onOpen={() => setOpen(t.id)} subs={all} expanded={expanded} onToggle={() => toggle(t.id)}
                        onAddSub={() => { toggle(t.id, true); setAddingFor(t.id); }} />
                      {expanded && subs.map((c) => <TaskRow key={c.id} t={c} people={people} onOpen={() => setOpen(c.id)} isSub />)}
                      {expanded && (all.length > 0 || addingFor === t.id) && (
                        <AddSubtaskRow key={`add-${t.id}`} engagementId={engagementId} parent={t} autoFocus={addingFor === t.id} onClose={() => setAddingFor(null)} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Timeline tasks={visible} phases={phases} people={people} onOpen={setOpen} />
      )}

      {open && <TaskDrawer key={open.id} task={open} engagementId={engagementId} all={tasks} phases={phases} people={people} me={me} onOpen={setOpen} onClose={() => setOpen(null)} />}
    </section>
  );
}

// ---------------- Editable list row ----------------
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function TaskRow({ t, people, onOpen, isSub, subs, expanded, onToggle, onAddSub }: {
  t: FullTask; people: User[]; onOpen: () => void; isSub?: boolean; subs?: FullTask[]; expanded?: boolean; onToggle?: () => void; onAddSub?: () => void;
}) {
  const [, start] = useTransition();
  const save = (patch: Parameters<typeof updateTask>[1]) => start(() => updateTask(t.id, patch));
  const cell = "w-full bg-transparent border border-transparent rounded-md px-2 py-1 text-[13px] text-ink hover:border-line-3 focus:border-mint-2 focus:bg-bg outline-none";
  return (
    <div className={`${GRID} px-4 py-2 items-start border-b border-line-2 hover:bg-[#2f3131] group ${isSub ? "bg-[#282a29]" : ""}`}>
      <button aria-label={`Open ${t.title}`} title="Open details, links and comments" onClick={onOpen}
        className="mt-1 w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-3 hover:text-mint hover:bg-[#373a39] cursor-pointer">
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
      </button>
      <div className={`flex items-start gap-2 min-w-0 ${isSub ? "relative pl-8" : ""}`}>
        {isSub && <span aria-hidden className="absolute left-3 -top-2 h-[22px] w-3.5 border-l border-b border-line-3 rounded-bl-md" />}
        {subs && subs.length > 0 && (
          <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} subtasks of ${t.title}`}
            className="mt-1 w-6 h-6 shrink-0 rounded-md inline-flex items-center justify-center bg-[#333635] text-ink-2 hover:text-ink cursor-pointer text-[10px]">{expanded ? "▼" : "▶"}</button>
        )}
        {t.isMilestone && <span aria-label="Milestone" title="Milestone" className="w-2.5 h-2.5 rotate-45 bg-mint-2 shrink-0 mt-2.5 mx-0.5" />}
        {t.isContent && <span title={`Content${formatLabel(t.contentFormat) ? ` · ${formatLabel(t.contentFormat)}` : ""}`} className="mt-2"><ContentIcon /></span>}
        <div className="flex-1 min-w-0 flex flex-col">
          <textarea aria-label="Task title" rows={1} defaultValue={t.title} ref={autoGrow} onInput={(e) => autoGrow(e.currentTarget)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { e.currentTarget.value = t.title; e.currentTarget.blur(); } }}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.title) save({ title: v }); else e.target.value = t.title; }}
          className={`${cell} resize-none overflow-hidden text-[14px] leading-snug ${t.status === "done" ? "text-ink-3 line-through" : t.isMilestone ? "font-semibold" : ""}`} />
          {((subs && subs.length > 0) || (t.isContent && formatLabel(t.contentFormat))) && (
            <div className="flex flex-wrap items-center gap-2 px-2 pb-0.5">

          {subs && subs.length > 0 && (() => {
            const done = subs.filter((c) => c.status === "done").length;
            return <span className="inline-flex items-center gap-1.5 text-xs text-ink-3 whitespace-nowrap" title={`${done} of ${subs.length} subtasks done`}>
              <span className="w-12 h-1.5 rounded bg-line overflow-hidden"><span className="block h-1.5 bg-mint-2" style={{ width: `${(done / subs.length) * 100}%` }} /></span>{done} of {subs.length}</span>;
          })()}
          {t.isContent && formatLabel(t.contentFormat) && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-[#362b45] text-[#c9a6f2] whitespace-nowrap ">{formatLabel(t.contentFormat)}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 pt-1.5 shrink-0">
          {!isSub && onAddSub && <button type="button" onClick={onAddSub} className="text-xs text-ink-3 hover:text-mint whitespace-nowrap cursor-pointer text-left opacity-0 group-hover:opacity-100 focus:opacity-100">+ Subtask</button>}
          {t.myPriority && <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-mint-bg text-mint font-mono tracking-wider whitespace-nowrap">MY · {t.myPriority.toUpperCase()}</span>}
          {t.waitingOnClient && <span className="chip text-amber bg-amber-bg">Client</span>}
          {t.comments.length > 0 && <button onClick={onOpen} className="text-xs text-ink-3 whitespace-nowrap hover:text-mint cursor-pointer text-left">{t.comments.length} comments</button>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 min-w-0 pt-0.5">
        <PersonPicker compact people={people} value={t.ownerId} onChange={(id) => save({ ownerId: id })} className="flex-1" />
        <span className="inline-flex pl-1">{t.assigneeIds.map((id) => { const p = people.find((x) => x.id === id); return p ? <span key={id} className="-ml-1.5 rounded-full border-2 border-panel"><Avatar name={p.name} src={p.avatarUrl} size={20} /></span> : null; })}</span>
      </div>
      <select key={t.status} aria-label="Status" defaultValue={t.status} onChange={(e) => save({ status: e.target.value as FullTask["status"] })}
        className="field min-h-8 px-2 text-[13px] font-medium mt-0.5 cursor-pointer" style={{ background: statusTone[t.status]?.[0], color: statusTone[t.status]?.[1], borderColor: "transparent" }}>
        {TASK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <input key={t.dueDate ?? ""} type="date" aria-label="Due date" defaultValue={t.dueDate ?? ""}
        onChange={(e) => save({ dueDate: e.target.value || null, startDate: t.startDate && e.target.value && t.startDate > e.target.value ? e.target.value : t.startDate ?? (e.target.value || null) })}
        className={`${cell} mt-0.5 ${isOverdue(t.dueDate, t.status) ? "text-red font-semibold" : ""}`} />
      <select aria-label="Priority" defaultValue={t.priority} onChange={(e) => save({ priority: e.target.value as FullTask["priority"] })} className={`${cell} mt-0.5 cursor-pointer`}>
        {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <div className="min-w-0 text-[13px] text-ink-2 leading-snug pt-1"><RichNotes compact value={t.notes ?? ""} placeholder="Add a note" onSave={(v) => save({ notes: v || null })} /></div>
      <button onClick={onOpen} title="Manage links" className={`mt-1 inline-flex items-center gap-1.5 text-[12.5px] cursor-pointer ${t.links.length ? "text-mint" : "text-ink-3 hover:text-ink"}`}><Icon name="link" size={14} />{t.links.length || "+"}</button>
    </div>
  );
}

/** Type a name and press Enter; the box stays open for the next one. */
function AddSubtaskRow({ engagementId, parent, autoFocus, onClose }: { engagementId: string; parent: FullTask; autoFocus: boolean; onClose: () => void }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const submit = () => {
    const title = v.trim();
    if (!title) return;
    setV(""); setErr("");
    start(async () => { try { await createTask(engagementId, { title, parentTaskId: parent.id }); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add the subtask"); setV(title); } });
  };
  return (
    <div className="px-4 py-2 border-b border-line-2 bg-[#282a29]">
      <form className="ml-[72px] flex items-center gap-2 max-w-[620px]" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <span aria-hidden className="text-mint font-semibold">+</span>
        <input className="field flex-1 min-h-9" value={v} onChange={(e) => setV(e.target.value)} autoFocus={autoFocus}
          placeholder={`Add a subtask to "${parent.title}"`} aria-label={`Add a subtask to ${parent.title}`}
          onKeyDown={(e) => { if (e.key === "Escape") { setV(""); onClose(); e.currentTarget.blur(); } }} />
        <button className="btn btn-ghost" disabled={!v.trim() || pending}>Add</button>
      </form>
      {err && <p role="alert" className="m-0 mt-1 ml-[72px] text-[12.5px] text-red">{err}</p>}
    </div>
  );
}

// ---------------- Timeline (Gantt) ----------------
const DAY = 864e5;
const d2n = (d: string) => Date.parse(d + "T00:00:00Z") / DAY;
const n2d = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

function Timeline({ tasks, phases, people, onOpen }: { tasks: FullTask[]; phases: Phase[]; people: User[]; onOpen: (id: string) => void }) {
  const dated = tasks.filter((t) => t.dueDate);
  const [, start] = useTransition();
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  if (!dated.length) return <div className="card"><Empty>Give tasks due dates to see them on the timeline.</Empty></div>;

  const starts = dated.map((t) => d2n(t.startDate ?? t.dueDate!)), ends = dated.map((t) => d2n(t.dueDate!));
  const today = d2n(todayISO());
  let lo = Math.min(...starts, today) - 3, hi = Math.max(...ends, today) + 7;
  lo -= ((lo % 7) + 7 + 3) % 7; // align to Monday
  const span = hi - lo;
  const pct = (n: number) => ((n - lo) / span) * 100;
  const weeks = Array.from({ length: Math.ceil(span / 7) }, (_, i) => lo + i * 7);
  const order = [...phases.map((p) => p.id), null];
  const rows = order.flatMap((pid) => {
    const ts = dated.filter((t) => (pid ? t.phaseId === pid : !t.phaseId || !phases.some((p) => p.id === t.phaseId)));
    if (!ts.length) return [];
    return [{ phase: pid ? phases.find((p) => p.id === pid)!.name : "No phase" }, ...ts.map((t) => ({ task: t }))];
  });

  const onPointerDown = (t: FullTask) => (e: React.PointerEvent) => {
    const startX = e.clientX;
    const width = area.current?.getBoundingClientRect().width ?? 1;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setDrag({ id: t.id, dx: Math.round(((ev.clientX - startX) / width) * span) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const days = Math.round(((ev.clientX - startX) / width) * span);
      setDrag(null);
      if (days === 0) return onOpen(t.id);
      const s = d2n(t.startDate ?? t.dueDate!) + days, d = d2n(t.dueDate!) + days;
      start(() => updateTask(t.id, { startDate: n2d(s), dueDate: n2d(d) }));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[1000px]">
        <div className="flex border-b border-line">
          <div className="w-[260px] shrink-0 px-4 py-3 text-xs font-semibold text-ink-3">Task</div>
          <div ref={area} className="flex-1 relative h-10">
            {weeks.map((w) => <span key={w} className="absolute top-3 pl-1.5 text-xs text-ink-3 whitespace-nowrap" style={{ left: `${pct(w)}%` }}>{fmtDate(n2d(w))}</span>)}
            <span className="absolute top-0.5 -translate-x-1/2 text-[10.5px] font-semibold text-red" style={{ left: `${pct(today)}%` }}>Today</span>
          </div>
        </div>
        {rows.map((r, i) => "phase" in r ? (
          <div key={`p${i}`} className="px-4 py-2 bg-panel-2 border-b border-line-2 text-xs font-semibold text-ink-2">{r.phase}</div>
        ) : (() => {
          const t = r.task;
          const dx = drag?.id === t.id ? drag.dx : 0;
          const s = d2n(t.startDate ?? t.dueDate!) + dx, d = d2n(t.dueDate!) + dx;
          const owner = people.find((p) => p.id === t.ownerId);
          const done = t.status === "done", blocked = t.status === "blocked";
          const fill = done ? "#24503a" : blocked ? "#5a2a2d" : "#2c4a3c", stroke = done ? "#5cc995" : blocked ? "#f06a5f" : "#7fdcae";
          return (
            <div key={t.id} className="flex border-b border-line-2">
              <button className="w-[260px] shrink-0 px-4 min-h-11 flex items-center gap-2 text-left bg-transparent cursor-pointer text-[13px]" onClick={() => onOpen(t.id)}>
                {owner ? <Avatar name={owner.name} src={owner.avatarUrl} size={22} /> : <span className="w-[22px]" />}
                {t.parentTaskId && <span aria-hidden className="text-ink-3 -mr-1">↳</span>}
                {t.isContent && <ContentIcon size={13} />}
                <span className={`truncate ${done ? "text-ink-3 line-through" : ""}`}>{t.title}</span>
              </button>
              <div className="flex-1 relative min-h-11">
                {weeks.map((w) => <span key={w} aria-hidden className="absolute inset-y-0 w-px bg-line-2" style={{ left: `${pct(w)}%` }} />)}
                <span aria-hidden className="absolute inset-y-0 border-l-[1.5px] border-dashed border-[#f06a5f]" style={{ left: `${pct(today)}%` }} />
                {t.isMilestone ? (
                  <button onPointerDown={onPointerDown(t)} aria-label={`Milestone ${t.title}, ${fmtDate(t.dueDate)}`}
                    className="absolute top-3.5 w-4 h-4 -translate-x-1/2 rotate-45 cursor-grab touch-none" style={{ left: `${pct(d + 0.5)}%`, background: done ? "#5cc995" : "#7fdcae" }} />
                ) : (
                  <button onPointerDown={onPointerDown(t)} aria-label={`${t.title}, ${fmtDate(n2d(s))} to ${fmtDate(n2d(d))}`}
                    className="absolute top-3 h-5 rounded-md cursor-grab touch-none box-border"
                    style={{ left: `${pct(s)}%`, width: `${Math.max(pct(d + 1) - pct(s), 1)}%`, background: fill, border: `1px solid ${stroke}` }} />
                )}
                <span className="absolute top-3.5 pl-2.5 text-[11.5px] text-ink-3 whitespace-nowrap pointer-events-none" style={{ left: `${pct(d + 1)}%` }}>
                  {t.startDate && t.startDate !== t.dueDate ? `${fmtDate(n2d(s))} – ${fmtDate(n2d(d))}` : fmtDate(n2d(d))}
                </span>
              </div>
            </div>
          );
        })())}
      </div>
      <div className="px-4 py-3 text-xs text-ink-3">Drag a bar or diamond to move it. Click to open.</div>
    </div>
  );
}

// ---------------- Task drawer ----------------
function TaskDrawer({ task: t, engagementId, all, phases, people, me, onOpen, onClose }: {
  task: FullTask; engagementId: string; all: FullTask[]; phases: Phase[]; people: User[]; me: Viewer; onOpen: (id: string) => void; onClose: () => void;
}) {
  const parent = t.parentTaskId ? all.find((x) => x.id === t.parentTaskId) ?? null : null;
  const subs = parent ? [] : all.filter((x) => x.parentTaskId === t.id);
  const [newSub, setNewSub] = useState("");
  // Ticks show right away; the server catches up a moment later.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const kind: "task" | "milestone" | "content" = t.isMilestone ? "milestone" : t.isContent ? "content" : "task";
  const [pending, start] = useTransition();
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const save = (patch: Parameters<typeof updateTask>[1]) => start(() => updateTask(t.id, patch));
  const person = (id: string) => people.find((p) => p.id === id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button aria-label="Close task" className="absolute inset-0 bg-[rgba(10,12,11,0.6)] cursor-pointer" onClick={onClose} />
      <aside aria-label="Task details" className="relative w-[480px] max-w-full h-full bg-panel shadow-[-8px_0_24px_rgba(0,0,0,0.45)] overflow-y-auto box-border px-6 pt-5 pb-8 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <span className="text-xs text-ink-3">
              {phases.find((p) => p.id === t.phaseId)?.name ?? "No phase"}{t.isMilestone ? " · Milestone" : t.isContent ? ` · Content${formatLabel(t.contentFormat) ? ` · ${formatLabel(t.contentFormat)}` : ""}` : ""}
              {parent && <> · Subtask of <button type="button" className="text-mint hover:underline cursor-pointer" onClick={() => onOpen(parent.id)}>{parent.title}</button></>}
            </span>
            <textarea aria-label="Title" rows={2} className="bg-transparent text-[20px] font-semibold leading-tight text-ink border-0 outline-none focus:bg-bg rounded px-1 -mx-1 resize-none" defaultValue={t.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && save({ title: e.target.value.trim() })} />
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost w-11 h-11 justify-center p-0"><Icon name="x" size={18} /></button>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-ink-3">Status</span>
          <div className="flex flex-wrap gap-1.5">
            {TASK_STATUSES.map((s) => {
              const on = t.status === s.id, [bg, fg] = statusTone[s.id]!;
              return <button key={s.id} aria-pressed={on} onClick={() => save({ status: s.id })} className="min-h-[34px] px-3 rounded-full text-xs font-medium cursor-pointer"
                style={on ? { background: bg, color: fg, border: `1px solid ${fg}` } : { border: "1px solid #4a4d4c", color: "#c3c7c5" }}>{s.label}</button>;
            })}
          </div>
        </div>

        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-3 text-[13px] items-center">
          <span className="text-ink-3">Type</span>
          <span className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
            {([["task", "Task"], ["milestone", "Milestone"], ["content", "Content"]] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={kind === id} onClick={() => save({ isMilestone: id === "milestone", isContent: id === "content" })}
                className={`min-h-8 px-2.5 rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer ${kind === id ? (id === "content" ? "border border-[#5a4775] bg-[#362b45] text-[#c9a6f2] font-semibold" : "border border-mint-2 bg-mint-bg text-mint font-semibold") : "border border-line-3 text-ink-2"}`}>
                {id === "milestone" && <span aria-hidden className="w-2 h-2 rotate-45 bg-mint-2" />}
                {id === "content" && <ContentIcon size={13} />}{label}
              </button>
            ))}
          </span>
          {t.isContent && <>
            <span className="text-ink-3">Format</span>
            <select className="field" aria-label="Content format" defaultValue={t.contentFormat ?? ""} onChange={(e) => save({ contentFormat: e.target.value || null })}>
              <option value="">Pick a format</option>{CONTENT_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </>}
          <span className="text-ink-3">Owner</span>
          <PersonPicker people={people} value={t.ownerId} onChange={(id) => save({ ownerId: id })} />
          <span className="text-ink-3 self-start pt-1.5">Assignees</span>
          <PeoplePicker people={people} value={t.assigneeIds} exclude={t.ownerId ? [t.ownerId] : []} onChange={(ids) => start(() => setAssignees(t.id, ids))} />
          <span className="text-ink-3">Phase</span>
          {parent ? <span className="text-ink-2">Same as “{parent.title}”</span> : (
            <select className="field" defaultValue={t.phaseId ?? ""} onChange={(e) => save({ phaseId: e.target.value || null })}>
              <option value="">No phase</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <span className="text-ink-3">Start</span>
          <input type="date" className="field" defaultValue={t.startDate ?? ""} onChange={(e) => save({ startDate: e.target.value || null })} />
          <span className="text-ink-3">Due</span>
          <input type="date" className="field" defaultValue={t.dueDate ?? ""} onChange={(e) => save({ dueDate: e.target.value || null })} />
          <span className="text-ink-3">Priority</span>
          <select className="field" defaultValue={t.priority} onChange={(e) => save({ priority: e.target.value as FullTask["priority"] })}>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="text-ink-3">My priority</span>
          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap gap-1">
              {MY_PRIORITIES.map((m) => <button key={m.id} aria-pressed={t.myPriority === m.id} onClick={() => start(() => setMyPriority(t.id, m.id))}
                className={`min-h-8 px-2.5 rounded-lg text-xs cursor-pointer ${t.myPriority === m.id ? "border border-mint-2 bg-mint-bg text-mint" : "border border-line-3 text-ink-2"}`}>{m.label}</button>)}
            </span>
            <span className="text-[11.5px] text-ink-3">Only you see this.</span>
          </span>
          <span className="text-ink-3">Flags</span>
          <span className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2"><input type="checkbox" defaultChecked={t.waitingOnClient} onChange={(e) => save({ waitingOnClient: e.target.checked })} />Waiting on client</label>
          </span>
          <span className="text-ink-3 self-start pt-2">Links</span>
          <span className="flex flex-col gap-1.5">
            {t.links.map((l) => (
              <span key={l.id} className="flex items-center gap-2"><a href={l.url} target="_blank" rel="noreferrer" className="no-underline truncate">{l.label}</a>
                <button aria-label="Remove link" className="text-ink-3 hover:text-red cursor-pointer" onClick={() => start(() => removeTaskLink(l.id))}>×</button></span>
            ))}
            <form className="flex flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); start(async () => { await addTaskLink(t.id, linkLabel, linkUrl); setLinkUrl(""); setLinkLabel(""); }); }}>
              <input className="field" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} aria-label="Link URL" />
              <div className="flex gap-1.5"><input className="field" placeholder="Label (optional)" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} aria-label="Link label" />
                <button className="btn btn-ghost" disabled={!linkUrl.trim()}>+ Add</button></div>
            </form>
          </span>
        </div>

        {!parent && (
          <section aria-label="Subtasks" className="flex flex-col gap-2 border-t border-line-2 pt-3">
            <div className="flex items-center justify-between text-[13px] font-semibold">
              <span>Subtasks{subs.length ? ` · ${subs.filter((c) => ticked[c.id] ?? c.status === "done").length} of ${subs.length} done` : ""}</span>
              {subs.length > 0 && <span className="w-16 h-1.5 rounded bg-line overflow-hidden"><span className="block h-1.5 bg-mint-2" style={{ width: `${(subs.filter((c) => ticked[c.id] ?? c.status === "done").length / subs.length) * 100}%` }} /></span>}
            </div>
            {subs.map((c) => {
              const owner = c.ownerId ? person(c.ownerId) : null;
              const done = ticked[c.id] ?? c.status === "done";
              return (
                <div key={c.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-panel-2 border border-line-2 text-[13.5px]">
                  <input type="checkbox" className="w-4 h-4 shrink-0" checked={done} aria-label={`Mark ${c.title} ${done ? "not done" : "done"}`}
                    onChange={() => { setTicked((x) => ({ ...x, [c.id]: !done })); start(() => updateTask(c.id, { status: done ? "not_started" : "done" })); }} />
                  {c.isContent && <ContentIcon size={13} />}
                  <button type="button" className={`flex-1 min-w-0 truncate text-left cursor-pointer hover:text-mint ${done ? "text-ink-3 line-through" : ""}`} onClick={() => onOpen(c.id)}>{c.title}</button>
                  <span className={`text-xs whitespace-nowrap ${isOverdue(c.dueDate, c.status) ? "text-red" : "text-ink-3"}`}>{[owner?.name.split(" ")[0] ?? "No owner", c.dueDate ? fmtDate(c.dueDate) : null].filter(Boolean).join(" · ")}</span>
                </div>
              );
            })}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const title = newSub.trim(); if (!title) return; setNewSub(""); start(() => createTask(engagementId, { title, parentTaskId: t.id }).then(() => undefined)); }}>
              <input className="field flex-1" placeholder="Add a subtask…" value={newSub} onChange={(e) => setNewSub(e.target.value)} aria-label="Add a subtask" />
              <button className="btn btn-primary" disabled={!newSub.trim() || pending}>Add</button>
            </form>
            {subs.length > 0 && <span className="text-xs text-ink-3">Check a box to mark it done. Click a name to open that subtask.</span>}
          </section>
        )}

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">Notes
          <RichNotes value={t.notes ?? ""} className="font-normal text-[13px]" placeholder="Context, decisions, anything the team should know"
            onSave={(v) => save({ notes: v || null })} />
        </label>

        <TaskComments task={t} people={people} me={me} onDeleteTask={() => { if (confirm(subs.length ? `Delete this task and its ${subs.length} subtask${subs.length === 1 ? "" : "s"}?` : parent ? "Delete this subtask?" : "Delete this task?")) start(async () => { await deleteTask(t.id); onClose(); }); }} />
      </aside>
    </div>
  );
}
