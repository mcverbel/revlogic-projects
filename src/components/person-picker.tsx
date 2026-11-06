"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./ui";

export type PickPerson = { id: string; name: string; email?: string | null; avatarUrl?: string | null };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Best matches first: first name / last name starts with the query, then anywhere in the name or email. */
function rank(people: PickPerson[], q: string) {
  const n = norm(q.trim());
  if (!n) return people;
  const scored: [PickPerson, number][] = [];
  for (const p of people) {
    const name = norm(p.name), email = norm((p.email ?? "").split("@")[0]!);
    const score = name.startsWith(n) ? 0 : name.split(/\s+/).some((w) => w.startsWith(n)) ? 1 : name.includes(n) ? 2 : email.includes(n) ? 3 : -1;
    if (score >= 0) scored.push([p, score]);
  }
  return scored.sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name)).map(([p]) => p);
}

/** Popover list with a search box. Rendered in a portal so table rows and drawers never clip it. */
function PickerPopover({ anchor, people, selected, noneLabel, onPick, onClose, placeholder }: {
  anchor: HTMLElement; people: PickPerson[]; selected: string[]; noneLabel?: string;
  onPick: (id: string | null) => void; onClose: () => void; placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const results = useMemo(() => rank(people, q), [people, q]);
  const rows: (PickPerson | null)[] = noneLabel && !q ? [null, ...results] : results;

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const width = Math.max(r.width, 280);
      const up = window.innerHeight - r.bottom < 340 && r.top > 340;
      setPos({ top: up ? r.top - 6 : r.bottom + 6, left: Math.min(r.left, window.innerWidth - width - 12), width, up });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor]);

  useEffect(() => {
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [anchor, onClose]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  if (!pos) return null;
  return createPortal(
    <div ref={box} role="dialog" aria-label={placeholder}
      className="fixed z-[100] rounded-xl border border-line-3 bg-panel shadow-[0_18px_50px_rgba(0,0,0,0.55)] overflow-hidden"
      style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}>
      <div className="flex items-center gap-2 px-3 border-b border-line-2">
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3 shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          role="combobox" aria-expanded="true" aria-controls="person-picker-list"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); const r = rows[active]; if (r !== undefined) onPick(r?.id ?? null); }
            else if (e.key === "Escape") { e.preventDefault(); onClose(); anchor.focus(); }
          }}
          className="w-full bg-transparent py-2.5 text-[14px] text-ink placeholder:text-ink-3 outline-none" />
      </div>
      <ul ref={list} id="person-picker-list" role="listbox" className="max-h-[280px] overflow-y-auto p-1.5 m-0 list-none">
        {rows.length === 0 && <li className="px-3 py-3 text-[13px] text-ink-3">No one matches “{q}”. Add them on the Team page.</li>}
        {rows.map((p, i) => {
          const on = p ? selected.includes(p.id) : selected.length === 0;
          return (
            <li key={p?.id ?? "none"} data-i={i} role="option" aria-selected={on}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); onPick(p?.id ?? null); }}
              className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer ${i === active ? "bg-side-active" : ""}`}>
              {p ? <Avatar name={p.name} src={p.avatarUrl} size={26} />
                : <span className="w-[26px] h-[26px] rounded-full border border-dashed border-line-3 shrink-0" />}
              <span className="flex flex-col min-w-0 flex-1 leading-tight">
                <span className={`text-[13.5px] truncate ${p ? "text-ink" : "text-ink-3"}`}>{p ? p.name : noneLabel}</span>
                {p?.email && <span className="text-[11.5px] text-ink-3 truncate">{p.email}</span>}
              </span>
              {on && <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="text-mint shrink-0"><path d="M20 6 9 17l-5-5" /></svg>}
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}

/** Pick one person. Type to filter. */
export function PersonPicker({ people, value, onChange, noneLabel = "Unassigned", label = "Owner", compact = false, className = "" }: {
  people: PickPerson[]; value: string | null; onChange: (id: string | null) => void;
  noneLabel?: string; label?: string; compact?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value);
  useEffect(() => setCurrent(value), [value]);
  const btn = useRef<HTMLButtonElement>(null);
  const person = people.find((p) => p.id === current);
  return (
    <>
      <button ref={btn} type="button" aria-label={`${label}: ${person?.name ?? noneLabel}`} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`group inline-flex items-center gap-2 min-w-0 text-left cursor-pointer rounded-lg border transition-colors ${compact
          ? "min-h-8 px-1.5 border-transparent hover:border-line-3 hover:bg-sunken"
          : "min-h-[38px] px-2.5 border-line-3 bg-sunken hover:border-ink-3"} ${open ? "border-mint-2!" : ""} ${className}`}>
        {person ? <Avatar name={person.name} src={person.avatarUrl} size={compact ? 22 : 24} />
          : <span className={`${compact ? "w-[22px] h-[22px]" : "w-6 h-6"} rounded-full border border-dashed border-line-3 shrink-0`} />}
        <span className={`truncate flex-1 text-[13.5px] ${person ? "text-ink" : "text-ink-3"}`}>{person?.name ?? noneLabel}</span>
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`text-ink-3 shrink-0 ${compact ? "opacity-0 group-hover:opacity-100" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && btn.current && (
        <PickerPopover anchor={btn.current} people={people} selected={current ? [current] : []} noneLabel={noneLabel}
          placeholder={`Search ${label.toLowerCase()}…`}
          onClose={() => setOpen(false)}
          onPick={(id) => { setOpen(false); btn.current?.focus(); if (id !== current) { setCurrent(id); onChange(id); } }} />
      )}
    </>
  );
}

/** Pick several people: chips plus "+ Add". */
export function PeoplePicker({ people, value, onChange, label = "Assignees", exclude = [] }: {
  people: PickPerson[]; value: string[]; onChange: (ids: string[]) => void; label?: string; exclude?: string[];
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const chosen = value.map((id) => people.find((p) => p.id === id)).filter(Boolean) as PickPerson[];
  const options = people.filter((p) => !exclude.includes(p.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chosen.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1.5 min-h-8 pl-0.5 pr-1 rounded-full border border-mint-2 bg-mint-bg text-xs text-ink">
          <Avatar name={p.name} src={p.avatarUrl} size={24} />{p.name}
          <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(value.filter((x) => x !== p.id))}
            className="w-6 h-6 rounded-full text-ink-3 hover:text-red hover:bg-sunken cursor-pointer">×</button>
        </span>
      ))}
      <button ref={btn} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center min-h-8 px-3 rounded-full border border-dashed border-line-3 text-xs text-ink-3 hover:text-ink hover:border-ink-3 cursor-pointer">
        + Add {label.toLowerCase().replace(/s$/, "")}
      </button>
      {open && btn.current && (
        <PickerPopover anchor={btn.current} people={options} selected={value} placeholder={`Search ${label.toLowerCase()}…`}
          onClose={() => setOpen(false)}
          onPick={(id) => { if (!id) return; onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]); }} />
      )}
    </div>
  );
}

/** PersonPicker for plain HTML forms: keeps the choice in a hidden input. */
export function PersonField({ name, people, defaultValue = null, noneLabel = "Unassigned", label = "Person" }: {
  name: string; people: PickPerson[]; defaultValue?: string | null; noneLabel?: string; label?: string;
}) {
  const [v, setV] = useState(defaultValue);
  return <><input type="hidden" name={name} value={v ?? ""} /><PersonPicker people={people} value={v} onChange={setV} noneLabel={noneLabel} label={label} /></>;
}
