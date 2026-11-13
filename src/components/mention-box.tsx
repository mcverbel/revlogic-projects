"use client";

import { useRef, useState, type ReactNode } from "react";
import { rank, type PickPerson } from "./person-picker";
import { Avatar } from "./ui";

/** Textarea that suggests teammates after "@". Picking one inserts "@First Last" and records their id. */
export function MentionBox({ people, value, onChange, mentionIds, onMentionIds, id, rows = 3 }: {
  people: PickPerson[]; value: string; onChange: (v: string) => void;
  mentionIds: string[]; onMentionIds: (ids: string[]) => void; id?: string; rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; q: string } | null>(null);
  const [active, setActive] = useState(0);
  const results = query ? rank(people, query.q).slice(0, 6) : [];

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = before.match(/(^|\s)@([^\s@]{0,20}(?: [^\s@]{0,20})?)$/);
    if (m && rank(people, m[2]!).length) { setQuery({ start: caret - m[2]!.length - 1, q: m[2]! }); setActive(0); }
    else setQuery(null);
  };

  const pick = (p: PickPerson) => {
    if (!query || !ref.current) return;
    const caret = ref.current.selectionStart;
    const next = `${value.slice(0, query.start)}@${p.name} ${value.slice(caret)}`;
    onChange(next);
    if (!mentionIds.includes(p.id)) onMentionIds([...mentionIds, p.id]);
    setQuery(null);
    const pos = query.start + p.name.length + 2;
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  };

  return (
    <div className="relative">
      <textarea ref={ref} id={id} className="field w-full" rows={rows} value={value}
        placeholder="Write a comment. Type @ to tag someone."
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onClick={(e) => detect(value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (!query || !results.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(results[active]!); }
          else if (e.key === "Escape") setQuery(null);
        }} />
      {query && results.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 bottom-full mb-1 z-50 m-0 p-1 list-none rounded-lg border border-line bg-panel shadow-lg max-h-[240px] overflow-auto">
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13px] ${i === active ? "bg-mint-bg" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}>
              <Avatar name={p.name} src={p.avatarUrl} size={22} />
              <span className="font-medium">{p.name}</span>
              {p.email && <span className="text-ink-3 text-xs truncate">{p.email.split("@")[0]}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Show "@First Last" for known teammates as a highlighted chip in a comment body. */
export function CommentBody({ body, people }: { body: string; people: PickPerson[] }) {
  const names = people.map((p) => p.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{body}</>;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(${esc.join("|")})`, "g");
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    out.push(body.slice(last, m.index));
    out.push(<span key={m.index} className="rounded px-1 bg-mint-bg text-mint font-medium">@{m[1]}</span>);
    last = m.index! + m[0].length;
  }
  out.push(body.slice(last));
  return <>{out}</>;
}
