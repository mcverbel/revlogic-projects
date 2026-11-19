"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import type { users as usersT } from "@/db/schema";
import type { FullNote } from "@/lib/notes";
import { NOTE_KINDS, WAITING_ON, nextSteps } from "@/lib/notes-shared";
import { PersonPicker } from "./person-picker";
import { MentionBox, CommentBody } from "./mention-box";
import { RichText } from "./rich-text";
import { Avatar, Icon, Empty } from "./ui";
import { createNote, updateNote, deleteNote, setNoteStatus, setNoteVisibility, addNoteReply, updateNoteReply, deleteNoteReply, noteStepsToTasks } from "@/actions/notes";
import { fmtDate, todayISO } from "@/lib/format";
import type { Viewer } from "./task-comments";

type User = typeof usersT.$inferSelect;
type TaskLite = { id: string; title: string; status: string };
type Draft = {
  kind: string; title: string; body: string; visibility: "team" | "private"; mentionIds: string[];
  waitingOn: string; ownerId: string | null; neededBy: string; taskIds: string[];
  meetingDate: string; attendees: string; recordingUrl: string;
};
const blank = (kind = "blocker"): Draft => ({
  kind, title: "", body: "", visibility: "team", mentionIds: [], waitingOn: "client", ownerId: null, neededBy: "", taskIds: [],
  meetingDate: todayISO(), attendees: "", recordingUrl: "",
});
const fromNote = (n: FullNote): Draft => ({
  kind: n.kind, title: n.title, body: n.body ?? "", visibility: n.visibility as Draft["visibility"], mentionIds: n.mentions,
  waitingOn: n.waitingOn ?? "client", ownerId: n.ownerId, neededBy: n.neededBy ?? "", taskIds: n.taskIds,
  meetingDate: n.meetingDate ?? "", attendees: n.attendees ?? "", recordingUrl: n.recordingUrl ?? "",
});
const kindOf = (id: string) => NOTE_KINDS.find((k) => k.id === id) ?? NOTE_KINDS[3];
const isIssue = (k: string) => k === "blocker" || k === "dependency";
const daysOpen = (d: Date) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));

type Filter = "all" | "blocker" | "dependency" | "meeting" | "note" | "mine";

export function NotesView({ engagementId, notes, people, tasks, me }: {
  engagementId: string; notes: FullNote[]; people: User[]; tasks: TaskLite[]; me: Viewer;
}) {
  const search = useSearchParams();
  const focusId = search.get("note");
  // "Add meeting notes" from the Overview's Client activity opens this tab with the meeting filled in.
  const prefill: Draft | undefined = search.get("new") === "meeting" ? {
    ...blank("meeting"), title: search.get("title") ?? "", meetingDate: search.get("date") ?? todayISO(),
    attendees: search.get("with") ?? "", recordingUrl: search.get("link") ?? "",
  } : undefined;
  const [filter, setFilter] = useState<Filter>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [q, setQ] = useState("");
  const [stepsFor, setStepsFor] = useState<FullNote | null>(null);

  useEffect(() => {
    if (!focusId) return;
    const n = notes.find((x) => x.id === focusId);
    if (n?.status === "resolved") setShowResolved(true);
    requestAnimationFrame(() => document.getElementById(`note-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (f: Filter) => notes.filter((n) => (f === "mine" ? n.visibility === "private" : n.kind === f)).length;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return notes
      .filter((n) => filter === "all" || (filter === "mine" ? n.visibility === "private" : n.kind === filter))
      .filter((n) => showResolved || n.status !== "resolved" || !isIssue(n.kind))
      .filter((n) => !s || [n.title, n.body, n.attendees, ...n.replies.map((r) => r.body)].some((x) => x?.toLowerCase().includes(s)));
  }, [notes, filter, showResolved, q]);
  const open = notes.filter((n) => isIssue(n.kind) && n.status === "open")
    .sort((a, b) => (a.neededBy ?? "9999").localeCompare(b.neededBy ?? "9999"));
  const lastMeeting = notes.filter((n) => n.kind === "meeting").sort((a, b) => (b.meetingDate ?? "").localeCompare(a.meetingDate ?? ""))[0];
  const resolvedCount = notes.filter((n) => isIssue(n.kind) && n.status === "resolved").length;
  const name = (id: string | null) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "";

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: `All ${notes.length}` },
    { id: "blocker", label: `Blockers ${count("blocker")}` },
    { id: "dependency", label: `Dependencies ${count("dependency")}` },
    { id: "meeting", label: `Meeting notes ${count("meeting")}` },
    { id: "note", label: `Notes ${count("note")}` },
    { id: "mine", label: `🔒 Only mine ${count("mine")}` },
  ];

  return (
    <div className="grid gap-5 items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
      <section className="flex flex-col gap-4 min-w-0" style={{ gridColumn: "span 2 / span 2" }}>
        <NoteForm key={prefill ? `pre-${prefill.title}-${prefill.meetingDate}` : "new"} engagementId={engagementId} people={people} tasks={tasks} meId={me.id} initial={prefill} />

        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
              className={`min-h-8 px-3 rounded-full text-[12.5px] border cursor-pointer ${filter === f.id ? "bg-ink text-bg border-ink font-semibold" : "border-line-3 text-ink-2 hover:text-ink"}`}>{f.label}</button>
          ))}
          {resolvedCount > 0 && (
            <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2 ml-1 cursor-pointer">
              <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />Show resolved ({resolvedCount})
            </label>
          )}
          <input className="field min-h-9 ml-auto w-full sm:w-[220px]" placeholder="Search notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        </div>

        {list.length === 0 && <div className="card p-5"><Empty>{notes.length ? "Nothing matches." : "No notes yet. Add a blocker, a dependency or your meeting notes above."}</Empty></div>}
        {list.map((n) => (
          <NoteCard key={n.id} n={n} people={people} tasks={tasks} me={me} engagementId={engagementId} focused={n.id === focusId} onSteps={() => setStepsFor(n)} />
        ))}
      </section>

      <aside className="flex flex-col gap-3.5 min-w-0">
        <div className="card px-4 py-3.5 flex flex-col gap-1">
          <span className="text-[13px] font-semibold mb-1">Open blockers &amp; dependencies</span>
          {open.length === 0 && <span className="text-[13px] text-ink-3">Nothing open.</span>}
          {open.map((n) => (
            <a key={n.id} href={`#note-${n.id}`} className="flex gap-2.5 items-start py-2 border-t border-line-2 first:border-t-0 no-underline text-ink">
              <span className="w-2 h-2 rounded-sm mt-1.5 shrink-0" style={{ background: kindOf(n.kind).color }} />
              <span className="flex flex-col min-w-0">
                <span className="text-[13px] leading-snug">{n.title}</span>
                <span className="text-xs text-ink-3">
                  {[WAITING_ON.find((w) => w.id === n.waitingOn)?.label, name(n.ownerId), n.neededBy && `due ${fmtDate(n.neededBy)}`, `${daysOpen(n.createdAt)}d open`].filter(Boolean).join(" · ")}
                  {n.visibility === "private" && " · 🔒"}
                </span>
              </span>
            </a>
          ))}
        </div>
        {lastMeeting && (
          <a href={`#note-${lastMeeting.id}`} className="card px-4 py-3.5 flex flex-col gap-1 no-underline text-ink">
            <span className="text-[13px] font-semibold">Latest meeting</span>
            <span className="text-[13px]">{lastMeeting.title}</span>
            <span className="text-xs text-ink-3">{lastMeeting.meetingDate ? fmtDate(lastMeeting.meetingDate) : fmtDate(lastMeeting.createdAt)} · {nextSteps(lastMeeting.body).length} next steps</span>
          </a>
        )}
      </aside>

      {stepsFor && <StepsToTasks n={stepsFor} people={people} onClose={() => setStepsFor(null)} />}
    </div>
  );
}

// ---------------- New / edit form ----------------
function NoteForm({ engagementId, people, tasks, meId, editing, onDone, initial }: {
  engagementId: string; people: User[]; tasks: TaskLite[]; meId: string; editing?: FullNote; onDone?: () => void; initial?: Draft;
}) {
  const [d, setD] = useState<Draft>(editing ? fromNote(editing) : initial ?? blank());
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const issue = isIssue(d.kind);
  const lockedVisibility = !!editing && editing.authorId !== meId;
  const submit = () => start(async () => {
    const input = { ...d, neededBy: d.neededBy || null, meetingDate: d.meetingDate || null };
    const r = editing ? await updateNote(editing.id, input) : await createNote(engagementId, input);
    if (r && "error" in r && r.error) { setError(r.error); return; }
    setError("");
    if (editing) onDone?.(); else setD(blank(d.kind));
  });

  return (
    <form className={`${editing ? "" : "card p-4"} flex flex-col gap-3`} aria-label={editing ? "Edit note" : "New note"} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Note type">
        {NOTE_KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={d.kind === k.id} onClick={() => set({ kind: k.id })}
            className={`inline-flex items-center gap-2 min-h-9 px-3 rounded-[9px] border text-[13px] cursor-pointer ${d.kind === k.id ? "border-mint-2 bg-mint-bg text-ink" : "border-line-3 text-ink-2 hover:text-ink"}`}>
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: k.color }} />{k.label}
          </button>
        ))}
      </div>
      <input className="field" value={d.title} onChange={(e) => set({ title: e.target.value })} aria-label="Title"
        placeholder={issue ? "Title, e.g. Waiting on the SKO agenda from the client" : d.kind === "meeting" ? "Title, e.g. Weekly sync with the client" : "Title"} />
      {issue && (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <label className="flex flex-col gap-1 text-xs text-ink-3">Waiting on
            <select className="field" value={d.waitingOn} onChange={(e) => set({ waitingOn: e.target.value })}>
              {WAITING_ON.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
            </select>
          </label>
          <span className="flex flex-col gap-1 text-xs text-ink-3">Who owns it
            <PersonPicker people={people} value={d.ownerId} onChange={(id) => set({ ownerId: id })} noneLabel="No owner" label="Owner" />
          </span>
          <label className="flex flex-col gap-1 text-xs text-ink-3">Needed by
            <input type="date" className="field" value={d.neededBy} onChange={(e) => set({ neededBy: e.target.value })} />
          </label>
          <span className="flex flex-col gap-1 text-xs text-ink-3">Holds up (optional)
            <TaskPicker tasks={tasks} value={d.taskIds} onChange={(ids) => set({ taskIds: ids })} />
          </span>
        </div>
      )}
      {d.kind === "meeting" && (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
          <label className="flex flex-col gap-1 text-xs text-ink-3">Meeting date
            <input type="date" className="field" value={d.meetingDate} onChange={(e) => set({ meetingDate: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-3">Who was there
            <input className="field" value={d.attendees} onChange={(e) => set({ attendees: e.target.value })} placeholder="Names, e.g. Jesse, Rick, Dana (client)" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-3">Recording or doc
            <input className="field" value={d.recordingUrl} onChange={(e) => set({ recordingUrl: e.target.value })} placeholder="Paste a link (Aurasell, Otter, Google Doc)" />
          </label>
        </div>
      )}
      <MentionBox people={people} value={d.body} onChange={(body) => set({ body })} mentionIds={d.mentionIds} onMentionIds={(ids) => set({ mentionIds: ids })} rows={4}
        placeholder={d.kind === "meeting" ? "What was discussed. End with “Next steps:” to turn them into tasks later." : "Details. Type @ to tag someone."} onSubmit={submit} />
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {error && <span role="alert" className="text-[13px] text-red mr-auto">{error}</span>}
        {!lockedVisibility && (
          <>
            <span className="text-[11.5px] font-semibold text-ink-2">Who can see this?</span>
            <span className="inline-flex rounded-[10px] border border-line-3 overflow-hidden" role="radiogroup" aria-label="Who can see this">
              {(["team", "private"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={d.visibility === v} title={v === "team" ? "Everyone on this project" : "Just you"}
                  onClick={() => set({ visibility: v })}
                  className={`min-h-9 px-3 text-[13px] cursor-pointer ${v === "private" ? "border-l border-line-3" : ""} ${d.visibility === v ? "bg-[#3a3f3d] text-ink" : "text-ink-2"}`}>
                  {v === "team" ? "👥 Team" : "🔒 Only me"}
                </button>
              ))}
            </span>
          </>
        )}
        {editing && <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>}
        <button className="btn btn-primary" disabled={!d.title.trim() || pending}>{pending ? "Saving…" : editing ? "Save" : "Add note"}</button>
      </div>
    </form>
  );
}

/** Pick Plan tasks a blocker holds up. Type to filter. */
function TaskPicker({ tasks, value, onChange }: { tasks: TaskLite[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const chosen = value.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as TaskLite[];
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.max(r.width, 320);
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - width - 12), width });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  const s = q.trim().toLowerCase();
  const rows = tasks.filter((t) => t.status !== "done" || value.includes(t.id)).filter((t) => !s || t.title.toLowerCase().includes(s)).slice(0, 60);
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="field text-left truncate cursor-pointer text-[13.5px]">
        {chosen.length ? <span className="text-ink">{chosen.map((t) => t.title).join(" · ")}</span> : <span className="text-ink-3">Pick tasks from the Plan</span>}
      </button>
      {open && pos && createPortal(
        <div ref={box} className="fixed z-[100] rounded-xl border border-line-3 bg-panel shadow-[0_18px_50px_rgba(0,0,0,0.55)] overflow-hidden" style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <input autoFocus className="w-full bg-transparent px-3 py-2.5 text-[14px] text-ink outline-none border-b border-line-2" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
          <ul role="listbox" aria-multiselectable="true" className="max-h-[280px] overflow-y-auto p-1.5 m-0 list-none">
            {rows.length === 0 && <li className="px-3 py-3 text-[13px] text-ink-3">No tasks match.</li>}
            {rows.map((t) => {
              const on = value.includes(t.id);
              return (
                <li key={t.id} role="option" aria-selected={on} onMouseDown={(e) => { e.preventDefault(); onChange(on ? value.filter((x) => x !== t.id) : [...value, t.id]); }}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-side-active text-[13.5px]">
                  <input type="checkbox" readOnly checked={on} tabIndex={-1} />{t.title}
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}

// ---------------- One note ----------------
function NoteCard({ n, people, tasks, me, engagementId, focused, onSteps }: {
  n: FullNote; people: User[]; tasks: TaskLite[]; me: Viewer; engagementId: string; focused: boolean; onSteps: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyIds, setReplyIds] = useState<string[]>([]);
  const [editReply, setEditReply] = useState<{ id: string; body: string; mentionIds: string[] } | null>(null);
  const k = kindOf(n.kind);
  const author = people.find((p) => p.id === n.authorId);
  const owner = people.find((p) => p.id === n.ownerId);
  const mine = n.authorId === me.id;
  const canEdit = mine || me.role === "admin";
  const priv = n.visibility === "private";
  const resolved = n.status === "resolved";
  const held = n.taskIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as TaskLite[];
  const steps = n.kind === "meeting" ? nextSteps(n.body) : [];
  const overdue = !resolved && n.neededBy && n.neededBy < todayISO();
  const sendReply = () => { if (reply.trim()) start(async () => { await addNoteReply(n.id, reply, replyIds); setReply(""); setReplyIds([]); setReplying(false); }); };
  const pill = (bg: string, fg: string, text: string) => <span className="inline-flex items-center min-h-6 px-2.5 rounded-full text-xs font-medium" style={{ background: bg, color: fg }}>{text}</span>;

  if (editing) {
    return <div id={`note-${n.id}`} className="card p-4"><NoteForm engagementId={engagementId} people={people} tasks={tasks} meId={me.id} editing={n} onDone={() => setEditing(false)} /></div>;
  }

  return (
    <article id={`note-${n.id}`} className={`card px-4 py-3.5 flex flex-col gap-2.5 border-l-[3px] ${focused ? "ring-1 ring-mint-2" : ""} ${resolved ? "opacity-70" : ""}`}
      style={{ borderLeftColor: k.id === "note" ? "transparent" : k.color, ...(priv ? { background: "repeating-linear-gradient(135deg, #2a2c2b 0 14px, #2c2e2d 14px 28px)" } : {}) }}>
      <div className="flex flex-wrap items-center gap-2">
        {pill(k.bg, k.color, k.label)}
        {isIssue(n.kind) && (resolved
          ? pill("#1f3a2c", "#8be3b7", `Resolved ${n.resolvedAt ? fmtDate(n.resolvedAt) : ""}`)
          : pill("#3a2a2a", "#ffb3ab", `Open · ${daysOpen(n.createdAt) === 0 ? "since today" : `${daysOpen(n.createdAt)} day${daysOpen(n.createdAt) === 1 ? "" : "s"}`}`))}
        {priv && pill("#2f2f3a", "#c9c9f2", "🔒 Only you")}
        <h3 className={`m-0 text-[16px] font-semibold ${resolved ? "line-through decoration-ink-3" : ""}`}>{n.title}</h3>
        <span className="ml-auto flex flex-wrap gap-0.5">
          {isIssue(n.kind) && <button type="button" className="btn btn-quiet px-2 text-[13px]" disabled={pending} onClick={() => start(() => setNoteStatus(n.id, resolved ? "open" : "resolved"))}>{resolved ? "Reopen" : "Mark resolved"}</button>}
          {mine && priv && <button type="button" className="btn btn-quiet px-2 text-[13px]" disabled={pending} onClick={() => start(() => setNoteVisibility(n.id, "team"))}>Share with team</button>}
          {canEdit && <button type="button" className="btn btn-quiet px-2 text-[13px]" onClick={() => setEditing(true)}>Edit</button>}
          {canEdit && <button type="button" className="btn btn-quiet px-2 text-[13px] hover:text-red" disabled={pending} onClick={() => confirm(`Delete "${n.title}"?`) && start(() => deleteNote(n.id))}>Delete</button>}
        </span>
      </div>

      {isIssue(n.kind) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
          {n.waitingOn && <span>Waiting on <b className="text-ink-2 font-medium">{WAITING_ON.find((w) => w.id === n.waitingOn)?.label}</b></span>}
          {owner && <span>Owner <b className="text-ink-2 font-medium">{owner.name}</b></span>}
          {n.neededBy && <span>Needed by <b className={`font-medium ${overdue ? "text-red" : "text-ink-2"}`}>{fmtDate(n.neededBy)}</b></span>}
          {held.length > 0 && <span>Holds up {held.map((t, i) => <span key={t.id}>{i ? ", " : ""}<a href={`plan?task=${t.id}`} className="text-mint">{t.title}</a></span>)}</span>}
        </div>
      )}
      {n.kind === "meeting" && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
          {n.meetingDate && <span>{fmtDate(n.meetingDate)}</span>}
          {n.attendees && <span>With <b className="text-ink-2 font-medium">{n.attendees}</b></span>}
          {n.recordingUrl && <span><RichText text={/^https?:\/\//.test(n.recordingUrl) ? `[Recording / doc](${n.recordingUrl})` : n.recordingUrl} /></span>}
        </div>
      )}
      {n.body && <div className="text-[14px] text-ink-2 leading-relaxed whitespace-pre-wrap break-words"><CommentBody body={n.body} people={people} /></div>}

      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
        <Avatar name={author?.name ?? "?"} src={author?.avatarUrl} size={22} />
        <span>{author?.name} · {fmtDate(n.createdAt)} · {priv ? "Only you can see this" : "👥 Shared with the team"}</span>
        {steps.length > 0 && <button type="button" onClick={onSteps} className="text-mint hover:underline cursor-pointer">Turn next steps into tasks ({steps.length})</button>}
      </div>

      <div className="flex flex-col gap-2 border-t border-line-2 pt-2.5">
          {n.replies.map((r) => {
            const a = people.find((p) => p.id === r.authorId);
            const own = r.authorId === me.id || me.role === "admin";
            return (
              <div key={r.id} className="flex gap-2 text-[13px] group">
                <Avatar name={a?.name ?? "?"} src={a?.avatarUrl} size={22} />
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="flex items-center gap-2"><span className="font-semibold">{a?.name}</span><span className="text-xs text-ink-3">{fmtDate(r.createdAt)}</span>
                    {own && editReply?.id !== r.id && (
                      <span className="ml-auto flex gap-1 opacity-60 group-hover:opacity-100">
                        <button type="button" className="text-xs text-ink-3 hover:text-ink cursor-pointer" onClick={() => setEditReply({ id: r.id, body: r.body, mentionIds: r.mentions })}>Edit</button>
                        <button type="button" className="text-xs text-ink-3 hover:text-red cursor-pointer" onClick={() => confirm("Delete this reply?") && start(() => deleteNoteReply(r.id))}>Delete</button>
                      </span>
                    )}
                  </span>
                  {editReply?.id === r.id ? (
                    <div className="flex flex-col gap-1.5">
                      <MentionBox people={people} value={editReply.body} autoFocus rows={2} onChange={(body) => setEditReply({ ...editReply, body })}
                        mentionIds={editReply.mentionIds} onMentionIds={(ids) => setEditReply({ ...editReply, mentionIds: ids })}
                        onSubmit={() => start(async () => { await updateNoteReply(r.id, editReply.body, editReply.mentionIds); setEditReply(null); })} />
                      <span className="flex justify-end gap-2">
                        <button type="button" className="btn btn-ghost min-h-8 px-3" onClick={() => setEditReply(null)}>Cancel</button>
                        <button type="button" className="btn btn-primary min-h-8 px-3" disabled={pending || !editReply.body.trim()}
                          onClick={() => start(async () => { await updateNoteReply(r.id, editReply.body, editReply.mentionIds); setEditReply(null); })}>Save</button>
                      </span>
                    </div>
                  ) : <span className="whitespace-pre-wrap break-words text-ink"><CommentBody body={r.body} people={people} /></span>}
                </div>
              </div>
            );
          })}
          {replying ? (
            <div className="flex flex-col gap-1.5">
              <MentionBox people={people} value={reply} onChange={setReply} mentionIds={replyIds} onMentionIds={setReplyIds} rows={2} autoFocus
                placeholder={priv ? "Add a private note to yourself…" : "Reply… Type @ to tag someone."} onSubmit={sendReply} />
              <span className="flex justify-end gap-2">
                <button type="button" className="btn btn-ghost min-h-8 px-3" onClick={() => { setReplying(false); setReply(""); }}>Cancel</button>
                <button type="button" className="btn btn-primary min-h-8 px-3" disabled={!reply.trim() || pending} onClick={sendReply}>Reply</button>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setReplying(true)}
              className="text-left min-h-9 px-3 rounded-lg border border-line-3 bg-sunken text-[13px] text-ink-3 hover:text-ink-2 cursor-text">
              {priv ? "Add a private note to yourself…" : "Reply…"}
            </button>
          )}
      </div>
    </article>
  );
}

// ---------------- Next steps → tasks ----------------
function StepsToTasks({ n, people, onClose }: { n: FullNote; people: User[]; onClose: () => void }) {
  const [rows, setRows] = useState(() => nextSteps(n.body).map((title) => {
    const first = title.split(/\s+/)[0]!.toLowerCase();
    const match = people.filter((p) => p.name.split(" ")[0]!.toLowerCase() === first);
    return { on: true, title, ownerId: match.length === 1 ? match[0]!.id : null as string | null, dueDate: "" };
  }));
  const [pending, start] = useTransition();
  const [done, setDone] = useState<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const picked = rows.filter((r) => r.on && r.title.trim());
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-start justify-center p-4 pt-[10vh]" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Turn next steps into tasks" className="card w-full max-w-2xl max-h-[80vh] overflow-auto p-5 flex flex-col gap-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-semibold">Turn next steps into tasks</span>
          <button aria-label="Close" className="btn btn-quiet px-2" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        {done !== null ? (
          <>
            <span className="text-[14px] text-mint-2">Added {done} task{done === 1 ? "" : "s"} to the Plan.</span>
            <span className="flex justify-end gap-2"><a className="btn btn-ghost no-underline text-ink" href="plan">Open Plan</a><button className="btn btn-primary" onClick={onClose}>Done</button></span>
          </>
        ) : (
          <>
            <span className="text-[13px] text-ink-2">From “{n.title}”. Uncheck what you don&apos;t need, fix the wording, and pick owners. Owners get a Slack DM.</span>
            <div className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <div key={i} className="grid gap-2 items-center" style={{ gridTemplateColumns: "24px minmax(0,1fr) 180px 150px" }}>
                  <input type="checkbox" checked={r.on} aria-label="Include" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                  <input className="field min-h-9" value={r.title} aria-label="Task name" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <PersonPicker people={people} value={r.ownerId} noneLabel="No owner" label="Owner" onChange={(id) => setRows(rows.map((x, j) => (j === i ? { ...x, ownerId: id } : x)))} />
                  <input type="date" className="field min-h-9" value={r.dueDate} aria-label="Due date" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} />
                </div>
              ))}
            </div>
            <span className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!picked.length || pending}
                onClick={() => start(async () => { const r = await noteStepsToTasks(n.id, picked.map(({ title, ownerId, dueDate }) => ({ title, ownerId, dueDate: dueDate || null }))); setDone(r.made); })}>
                {pending ? "Adding…" : `Add ${picked.length} task${picked.length === 1 ? "" : "s"}`}
              </button>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
