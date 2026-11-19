"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { FullTask } from "@/lib/queries";
import type { users as usersT } from "@/db/schema";
import type { BoardOption } from "@/lib/design-board";
import { PersonPicker } from "./person-picker";
import { MentionBox, CommentBody } from "./mention-box";
import { Avatar, Icon, Empty } from "./ui";
import { updateTask, addComment, deleteTask } from "@/actions/tasks";
import { createDesignTask, setTaskStatusOption, setAccountOwner, setTaskDone, saveBoardOption, deleteBoardOption, moveBoardOption } from "@/actions/design";
import { fmtDate, isOverdue } from "@/lib/format";

type User = typeof usersT.$inferSelect;

/** Dark or light text, whichever reads better on the option's color. */
export function inkOn(hex: string | null | undefined) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "#e6e8e7";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.5 ? "#1f2523" : "#f4f5f4";
}

export function Pill({ label, color, muted }: { label: string; color?: string | null; muted?: boolean }) {
  return (
    <span className="inline-flex items-center min-h-7 px-2.5 rounded-md text-[13px] font-medium truncate max-w-full"
      style={color ? { background: color, color: inkOn(color) } : { border: "1px solid #4a4d4c", color: muted ? "#8f9492" : "#c3c7c5" }}>
      {label}
    </span>
  );
}

/** Dropdown of colored options, in a portal so the list never gets clipped. */
function OptionSelect({ options, value, onChange, noneLabel, label, fallback }: {
  options: BoardOption[]; value: string | null; onChange: (id: string | null) => void; noneLabel?: string; label: string;
  fallback?: { label: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.max(r.width, 200);
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - width - 12), width });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const away = () => setOpen(false);
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key); window.addEventListener("scroll", away, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); window.removeEventListener("scroll", away, true); };
  }, [open]);
  const rows: (BoardOption | null)[] = noneLabel ? [null, ...options] : options;
  return (
    <>
      <button ref={btn} type="button" aria-label={`${label}: ${current?.label ?? fallback?.label ?? noneLabel ?? ""}`} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 w-full min-h-[38px] px-1.5 rounded-lg border border-transparent hover:border-line-3 cursor-pointer text-left">
        {current ? <Pill label={current.label} color={current.color} /> : fallback ? <Pill label={fallback.label} /> : <Pill label={noneLabel ?? "Pick"} muted />}
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="ml-auto text-ink-3 shrink-0"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && pos && createPortal(
        <div ref={box} role="listbox" aria-label={label} className="fixed z-[100] rounded-xl border border-line-3 bg-panel shadow-[0_18px_50px_rgba(0,0,0,0.55)] p-1.5 max-h-[320px] overflow-y-auto"
          style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {rows.map((o) => (
            <button key={o?.id ?? "none"} role="option" aria-selected={(o?.id ?? null) === value} type="button"
              onClick={() => { setOpen(false); if ((o?.id ?? null) !== value) onChange(o?.id ?? null); }}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-side-active cursor-pointer text-left">
              {o ? <Pill label={o.label} color={o.color} /> : <Pill label={noneLabel!} muted />}
              {(o?.id ?? null) === value && <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="ml-auto text-mint shrink-0"><path d="M20 6 9 17l-5-5" /></svg>}
            </button>
          ))}
          {rows.length === 0 && <span className="block px-2 py-2 text-[13px] text-ink-3">No options yet.</span>}
        </div>,
        document.body,
      )}
    </>
  );
}

const GRID = "grid grid-cols-[40px_minmax(220px,1fr)_150px_190px_200px_170px] gap-2 items-center";

export function DesignBoard({ engagementId, mode, tasks, contractors, statuses, people, canEdit }: {
  engagementId: string; mode: "open" | "done"; tasks: FullTask[]; contractors: BoardOption[]; statuses: BoardOption[]; people: User[]; canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<"contractor" | "status" | null>(null);
  const [pending, start] = useTransition();
  const openId = search.get("task");
  const open = tasks.find((t) => t.id === openId) ?? null;
  const setOpen = (id: string | null) => router.replace(id ? `${pathname}?task=${id}` : pathname, { scroll: false });

  const list = useMemo(() => {
    if (mode === "open") {
      return tasks.filter((t) => t.status !== "done")
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.toString().localeCompare(b.createdAt.toString()));
    }
    const n = q.trim().toLowerCase();
    const name = (id: string | null) => people.find((p) => p.id === id)?.name.toLowerCase() ?? "";
    return tasks.filter((t) => t.status === "done")
      .filter((t) => !n || t.title.toLowerCase().includes(n) || (t.notes ?? "").toLowerCase().includes(n) || name(t.ownerId).includes(n) || name(t.accountOwnerId).includes(n))
      .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());
  }, [tasks, mode, q, people]);

  const gear = (field: "contractor" | "status") => canEdit && (
    <button type="button" aria-label={`Edit ${field} options`} title="Edit options" onClick={() => setEditing(field)}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-3 hover:text-ink hover:bg-sunken cursor-pointer">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
    </button>
  );

  return (
    <section className="flex flex-col gap-4">
      {mode === "done" && (
        <label className="flex items-center gap-2.5 card px-3.5 min-h-12">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3 shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search completed tasks by name, notes, contractor or account owner"
            aria-label="Search completed tasks" className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-3 outline-none" />
        </label>
      )}

      <div className="card overflow-x-auto">
        <div className="min-w-[980px]">
          <div className={`${GRID} px-3 py-2.5 border-b border-line text-xs font-semibold text-ink-3`}>
            <span><span className="sr-only">Done</span></span><span>Task name</span><span>Due date</span>
            <span className="flex items-center gap-1">Assigned contractor{gear("contractor")}</span>
            <span>Account owner</span>
            <span className="flex items-center gap-1">Status{gear("status")}</span>
          </div>
          {mode === "open" && <NewDesignTask engagementId={engagementId} contractors={contractors} statuses={statuses} people={people} />}
          {list.length === 0 && <div className="px-4 py-6"><Empty>{mode === "open" ? "No open tasks." : q ? `Nothing matches “${q}”.` : "No completed tasks yet."}</Empty></div>}
          {list.map((t) => (
            <Row key={t.id} t={t} mode={mode} contractors={contractors} statuses={statuses} people={people} onOpen={() => setOpen(t.id)} pending={pending} start={start} />
          ))}
        </div>
      </div>
      {mode === "done" && list.length > 0 && <span className="text-xs text-ink-3">Newest first. Uncheck a task to move it back to Tasks.</span>}

      {open && <DesignTaskDrawer key={open.id} task={open} people={people} contractors={contractors} statuses={statuses} onClose={() => setOpen(null)} />}
      {editing && <OptionsEditor engagementId={engagementId} field={editing} options={editing === "contractor" ? contractors : statuses} people={people} onClose={() => setEditing(null)} />}
    </section>
  );
}

function DoneCircle({ done, onToggle, title }: { done: boolean; onToggle: () => void; title: string }) {
  return (
    <button type="button" aria-pressed={done} aria-label={done ? `Reopen "${title}"` : `Mark "${title}" complete`} onClick={onToggle}
      className={`w-7 h-7 rounded-full border-2 inline-flex items-center justify-center cursor-pointer shrink-0 ${done ? "bg-mint-2 border-mint-2 text-mint-ink" : "border-line-3 text-transparent hover:border-mint-2 hover:text-mint-2"}`}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
    </button>
  );
}

function Row({ t, mode, contractors, statuses, people, onOpen, pending, start }: {
  t: FullTask; mode: "open" | "done"; contractors: BoardOption[]; statuses: BoardOption[]; people: User[];
  onOpen: () => void; pending: boolean; start: (fn: () => Promise<void>) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const contractor = contractors.find((c) => c.userId === t.ownerId);
  const ownerName = people.find((p) => p.id === t.ownerId)?.name;
  const overdue = mode === "open" && isOverdue(t.dueDate, t.status);
  return (
    <div className={`${GRID} px-3 py-1.5 border-b border-line-2 transition-opacity ${leaving ? "opacity-40" : ""}`}>
      <DoneCircle done={t.status === "done"} title={t.title} onToggle={() => { setLeaving(true); start(() => setTaskDone(t.id, t.status !== "done")); }} />
      <button type="button" onClick={onOpen} className="text-left text-[14px] leading-snug py-1.5 cursor-pointer hover:underline decoration-line-3 underline-offset-4">
        {t.title}
        {mode === "done" && t.completedAt && <span className="block text-xs text-ink-3 no-underline">Completed {fmtDate(t.completedAt)}</span>}
      </button>
      <input type="date" aria-label={`Due date for ${t.title}`} defaultValue={t.dueDate ?? ""}
        onChange={(e) => start(() => updateTask(t.id, { dueDate: e.target.value || null }))}
        className={`field min-h-[38px] ${overdue ? "text-red" : ""}`} />
      <OptionSelect label="Assigned contractor" options={contractors} value={contractor?.id ?? null} noneLabel="None"
        fallback={!contractor && ownerName ? { label: ownerName } : null}
        onChange={(id) => start(() => updateTask(t.id, { ownerId: contractors.find((c) => c.id === id)?.userId ?? null }))} />
      <PersonPicker people={people} value={t.accountOwnerId} noneLabel="None" label="Account owner" compact
        onChange={(id) => start(() => setAccountOwner(t.id, id))} />
      <OptionSelect label="Status" options={statuses} value={t.statusOptionId ?? statuses[0]?.id ?? null}
        onChange={(id) => id && start(() => setTaskStatusOption(t.id, id))} />
    </div>
  );
}

function NewDesignTask({ engagementId, contractors, statuses, people }: { engagementId: string; contractors: BoardOption[]; statuses: BoardOption[]; people: User[] }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [contractor, setContractor] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(statuses[0]?.id ?? null);
  const [pending, start] = useTransition();
  useEffect(() => { if (!status && statuses[0]) setStatus(statuses[0].id); }, [statuses, status]);
  const add = () => start(async () => {
    await createDesignTask(engagementId, { title, dueDate: due || null, ownerId: contractors.find((c) => c.id === contractor)?.userId ?? null, accountOwnerId: owner, statusOptionId: status });
    setTitle(""); setDue(""); setContractor(null); setOwner(null); setStatus(statuses[0]?.id ?? null);
  });
  return (
    <form aria-label="New task" className={`${GRID} px-3 py-2.5 border-b border-line bg-[#2a2c2b]`} onSubmit={(e) => { e.preventDefault(); if (title.trim()) add(); }}>
      <button className="w-8 h-8 rounded-full bg-mint-2 text-mint-ink inline-flex items-center justify-center cursor-pointer disabled:opacity-40" disabled={!title.trim() || pending} aria-label="Add task">
        <Icon name="plus" size={16} />
      </button>
      <input className="field min-h-[38px]" placeholder="New task name" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New task name" />
      <input type="date" className="field min-h-[38px]" value={due} onChange={(e) => setDue(e.target.value)} aria-label="New task due date" />
      <OptionSelect label="Assigned contractor" options={contractors} value={contractor} noneLabel="None" onChange={setContractor} />
      <PersonPicker people={people} value={owner} noneLabel="None" label="Account owner" onChange={setOwner} />
      <OptionSelect label="Status" options={statuses} value={status} onChange={(id) => id && setStatus(id)} />
    </form>
  );
}

// ---------------- Options editor (Melissa and admins) ----------------
function OptionsEditor({ engagementId, field, options, people, onClose }: {
  engagementId: string; field: "contractor" | "status"; options: BoardOption[]; people: User[]; onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [color, setColor] = useState(field === "status" ? "#A4C2F4" : "#DFC2EE");
  const isC = field === "contractor";
  const run = (fn: () => Promise<{ error?: string } | void | { ok: boolean }>) => start(async () => {
    const r = await fn(); setError(r && "error" in r && r.error ? r.error : "");
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const taken = options.map((o) => o.userId).filter(Boolean) as string[];
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-start justify-center p-4 pt-[10vh]" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Edit ${field} options`} className="card w-full max-w-xl max-h-[80vh] overflow-auto p-5 flex flex-col gap-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-semibold">{isC ? "Assigned contractor options" : "Status options"}</span>
          <button aria-label="Close" className="btn btn-quiet px-2" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <span className="text-[13px] text-ink-2">{isC ? "Contractors are team members, so they get a Slack message when a task is assigned to them." : "The first status is the default for new tasks."} Colors are hex codes.</span>
        <div className="flex flex-col gap-2">
          {options.map((o, i) => <OptionRow key={o.id} o={o} isC={isC} people={people} first={i === 0} last={i === options.length - 1}
            onSave={(patch) => run(() => saveBoardOption(engagementId, { id: o.id, field, label: patch.label, color: patch.color, userId: patch.userId }))}
            onDelete={() => confirm(`Remove "${o.label}"?${isC ? "" : " Its tasks move to the first status."}`) && run(() => deleteBoardOption(engagementId, o.id))}
            onMove={(d) => start(() => moveBoardOption(engagementId, o.id, d))} pending={pending} />)}
          {options.length === 0 && <span className="text-[13px] text-ink-3">None yet.</span>}
        </div>
        <form className="flex flex-wrap items-center gap-2 border-t border-line-2 pt-4" onSubmit={(e) => {
          e.preventDefault();
          const name = isC ? people.find((p) => p.id === userId)?.name ?? "" : label;
          run(async () => { const r = await saveBoardOption(engagementId, { field, label: name, color, userId }); if (!("error" in r)) { setLabel(""); setUserId(null); } return r; });
        }}>
          {isC
            ? <span className="flex-1 min-w-[200px]"><PersonPicker people={people.filter((p) => !taken.includes(p.id))} value={userId} onChange={setUserId} noneLabel="Pick a team member" label="Contractor" /></span>
            : <input className="field flex-1 min-w-[180px]" placeholder="New status" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="New status name" />}
          <ColorField value={color} onChange={setColor} />
          <button className="btn btn-primary" disabled={pending || (isC ? !userId : !label.trim())}>Add</button>
        </form>
        {error && <span role="alert" className="text-[13px] text-red">{error}</span>}
      </div>
    </div>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const valid = /^#?[0-9a-f]{6}$/i.test(value.trim());
  const hex = valid ? (value.trim().startsWith("#") ? value.trim() : `#${value.trim()}`) : "#000000";
  return (
    <span className="inline-flex items-center gap-1.5">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label="Pick color" className="w-9 h-9 rounded-md border border-line-3 bg-transparent cursor-pointer p-0.5" />
      <input className={`field w-[100px] font-mono text-[13px] ${valid ? "" : "border-red!"}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Hex color" placeholder="#A4C2F4" />
    </span>
  );
}

function OptionRow({ o, isC, people, first, last, onSave, onDelete, onMove, pending }: {
  o: BoardOption; isC: boolean; people: User[]; first: boolean; last: boolean; pending: boolean;
  onSave: (p: { label: string; color: string | null; userId: string | null }) => void; onDelete: () => void; onMove: (d: -1 | 1) => void;
}) {
  const [label, setLabel] = useState(o.label);
  const [color, setColor] = useState(o.color ?? "");
  const [userId, setUserId] = useState<string | null>(o.userId);
  const dirty = label !== o.label || color !== (o.color ?? "") || userId !== o.userId;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex flex-col">
        <button type="button" aria-label="Move up" disabled={first || pending} onClick={() => onMove(-1)} className="text-ink-3 hover:text-ink disabled:opacity-30 cursor-pointer leading-none text-xs">▲</button>
        <button type="button" aria-label="Move down" disabled={last || pending} onClick={() => onMove(1)} className="text-ink-3 hover:text-ink disabled:opacity-30 cursor-pointer leading-none text-xs">▼</button>
      </span>
      <Pill label={label || "…"} color={/^#[0-9a-f]{6}$/i.test(color) ? color : null} />
      {isC && <span className="w-[170px]"><PersonPicker people={people} value={userId} onChange={(id) => { setUserId(id); const p = people.find((x) => x.id === id); if (p) setLabel(p.name); }} noneLabel="Pick" label="Contractor" compact /></span>}
      <input className="field flex-1 min-w-[120px]" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Name shown" />
      <ColorField value={color} onChange={setColor} />
      <button type="button" className="btn btn-ghost" disabled={!dirty || pending} onClick={() => onSave({ label, color: color || null, userId })}>Save</button>
      <button type="button" aria-label={`Remove ${o.label}`} className="btn btn-quiet px-2 text-ink-3 hover:text-red" disabled={pending} onClick={onDelete}>×</button>
    </div>
  );
}

// ---------------- Task window: notes and comments ----------------
function DesignTaskDrawer({ task: t, people, contractors, statuses, onClose }: {
  task: FullTask; people: User[]; contractors: BoardOption[]; statuses: BoardOption[]; onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [comment, setComment] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const person = (id: string | null) => people.find((p) => p.id === id);
  const contractor = contractors.find((c) => c.userId === t.ownerId);
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button aria-label="Close task" className="absolute inset-0 bg-[rgba(10,12,11,0.6)] cursor-pointer" onClick={onClose} />
      <aside aria-label="Task details" className="relative w-[480px] max-w-full h-full bg-panel shadow-[-8px_0_24px_rgba(0,0,0,0.45)] overflow-y-auto box-border px-6 pt-5 pb-8 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5 flex-1">
            {t.status === "done" && <span className="text-xs text-ink-3">Completed {fmtDate(t.completedAt)}</span>}
            <textarea aria-label="Title" rows={2} className="bg-transparent text-[20px] font-semibold leading-tight text-ink border-0 outline-none focus:bg-bg rounded px-1 -mx-1 resize-none" defaultValue={t.title}
              onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && start(() => updateTask(t.id, { title: e.target.value.trim() }))} />
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost w-11 h-11 justify-center p-0"><Icon name="x" size={18} /></button>
        </div>

        <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-2 items-center text-[13px]">
          <span className="text-ink-3">Due date</span>
          <input type="date" aria-label="Due date" defaultValue={t.dueDate ?? ""} onChange={(e) => start(() => updateTask(t.id, { dueDate: e.target.value || null }))}
            className={`field min-h-[38px] ${isOverdue(t.dueDate, t.status) ? "text-red" : ""}`} />
          <span className="text-ink-3">Assigned contractor</span>
          <OptionSelect label="Assigned contractor" options={contractors} value={contractor?.id ?? null} noneLabel="None"
            fallback={!contractor && person(t.ownerId) ? { label: person(t.ownerId)!.name } : null}
            onChange={(id) => start(() => updateTask(t.id, { ownerId: contractors.find((c) => c.id === id)?.userId ?? null }))} />
          <span className="text-ink-3">Account owner</span>
          <PersonPicker people={people} value={t.accountOwnerId} noneLabel="None" label="Account owner" onChange={(id) => start(() => setAccountOwner(t.id, id))} />
          <span className="text-ink-3">Status</span>
          <OptionSelect label="Status" options={statuses} value={t.statusOptionId ?? statuses[0]?.id ?? null} onChange={(id) => id && start(() => setTaskStatusOption(t.id, id))} />
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">Notes
          <textarea className="field font-normal text-[13px]" rows={5} defaultValue={t.notes ?? ""} placeholder="Brief, links, sizes, anything the designer should know"
            onBlur={(e) => e.target.value !== (t.notes ?? "") && start(() => updateTask(t.id, { notes: e.target.value || null }))} />
        </label>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <span className="text-xs font-semibold text-ink-3">Comments</span>
          {t.comments.length === 0 && <span className="text-[13px] text-ink-3">No comments yet.</span>}
          {t.comments.map((c) => {
            const a = person(c.authorId);
            return (
              <div key={c.id} className="flex gap-2.5">
                <Avatar name={a?.name ?? "?"} src={a?.avatarUrl} size={28} />
                <div className="flex flex-col gap-0.5 min-w-0"><span className="text-[13px]"><span className="font-semibold">{a?.name}</span> <span className="text-xs text-ink-3">{fmtDate(c.createdAt)}</span></span>
                  <span className="text-[14px] leading-relaxed whitespace-pre-wrap"><CommentBody body={c.body} people={people} /></span></div>
              </div>
            );
          })}
          <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { await addComment(t.id, comment, mentionIds); setComment(""); setMentionIds([]); }); }}>
            <label htmlFor="comment" className="text-xs text-ink-3">Add a comment. Anyone you @tag gets a Slack DM.</label>
            <MentionBox id="comment" people={people} value={comment} onChange={setComment} mentionIds={mentionIds} onMentionIds={setMentionIds} />
            <div className="flex justify-between">
              <button type="button" className="btn btn-quiet hover:text-red" onClick={() => { if (confirm("Delete this task?")) start(async () => { await deleteTask(t.id); onClose(); }); }}>Delete task</button>
              <button className="btn btn-primary" disabled={!comment.trim() || pending}>Comment</button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
