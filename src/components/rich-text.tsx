"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { TOKEN, isUrl, withScheme, shortUrl } from "@/lib/rich";
export { shortUrl, plainText, toSlack } from "@/lib/rich";

/** Render text with clickable links. `decorate` handles the plain pieces (used for @mentions in comments). */
export function RichText({ text, decorate }: { text: string; decorate?: (plain: string, key: string) => ReactNode }) {
  const out: ReactNode[] = [];
  let last = 0, i = 0;
  const plain = (s: string) => { if (s) out.push(decorate ? decorate(s, `p${i++}`) : s); };
  for (const m of text.matchAll(TOKEN)) {
    plain(text.slice(last, m.index));
    const url = m[2] ?? m[3]!;
    out.push(
      <a key={`l${m.index}`} href={url} target="_blank" rel="noreferrer" title={url} onClick={(e) => e.stopPropagation()}
        className="text-mint underline decoration-mint/40 underline-offset-2 hover:decoration-mint break-words">
        {m[1] ?? shortUrl(url)}
      </a>,
    );
    last = m.index! + m[0].length;
  }
  plain(text.slice(last));
  return <>{out}</>;
}

/**
 * Notes field that shows links as linked text. Click to edit; select words and press ⌘K (Ctrl+K)
 * or paste a URL over them to link them. Saves when you click away.
 */
export function RichNotes({ value, onSave, onChange, placeholder = "Add a note", ariaLabel = "Notes", minRows = 3, className = "", compact = false, editOnly = false, autoFocus = false }: {
  value: string; onSave?: (v: string) => void; onChange?: (v: string) => void; placeholder?: string; ariaLabel?: string;
  minRows?: number; className?: string; compact?: boolean; editOnly?: boolean; autoFocus?: boolean;
}) {
  const [editing, setEditing] = useState(editOnly || autoFocus);
  const [draft, setDraft] = useState(value);
  const [link, setLink] = useState<{ start: number; end: number; text: string; url: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const sel = useRef<[number, number]>([0, 0]);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useLayoutEffect(() => {
    const el = ta.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; }
  }, [draft, editing]);
  useEffect(() => { if (link) urlInput.current?.focus(); }, [link]);

  const change = (v: string) => { setDraft(v); onChange?.(v); };
  const finish = () => {
    setLink(null);
    if (draft !== value) onSave?.(draft);
    if (!editOnly) setEditing(false);
  };
  const startEdit = () => {
    setEditing(true);
    requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  };
  const openLink = () => {
    const el = ta.current;
    const [s, e] = el ? [el.selectionStart, el.selectionEnd] : sel.current;
    sel.current = [s, e];
    setLink({ start: s, end: e, text: draft.slice(s, e), url: "" });
  };
  const applyLink = () => {
    if (!link) return;
    const url = link.url.trim();
    if (!url) { setLink(null); return; }
    const md = `[${(link.text.trim() || shortUrl(withScheme(url))).replace(/[\[\]]/g, "")}](${withScheme(url)})`;
    const next = draft.slice(0, link.start) + md + draft.slice(link.end);
    change(next);
    setLink(null);
    requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); const p = link.start + md.length; el.setSelectionRange(p, p); } });
  };

  if (!editing) {
    return (
      <div role="button" tabIndex={0} aria-label={`${ariaLabel}. Click to edit`}
        onClick={(e) => { if (!(e.target as HTMLElement).closest("a") && !window.getSelection()?.toString()) startEdit(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); startEdit(); } }}
        className={`${compact ? "rounded px-1 -mx-1 py-0.5 min-h-8" : "field min-h-[44px] py-2 leading-relaxed"} whitespace-pre-wrap break-words cursor-text text-left ${className}`}
        style={compact ? undefined : { minHeight: `${minRows * 1.5 + 1}em` }}>
        {value.trim() ? <RichText text={value} /> : <span className="text-ink-3">{placeholder}</span>}
      </div>
    );
  }

  return (
    <div ref={box} className="flex flex-col gap-1.5"
      onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) finish(); }}>
      <textarea ref={ta} aria-label={ariaLabel} value={draft} placeholder={placeholder} rows={compact ? 1 : minRows}
        autoFocus={autoFocus || !editOnly}
        onChange={(e) => change(e.target.value)}
        onSelect={(e) => { sel.current = [e.currentTarget.selectionStart, e.currentTarget.selectionEnd]; }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openLink(); }
          if (e.key === "Escape" && !editOnly) { e.preventDefault(); finish(); }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          const el = e.currentTarget;
          if (el.selectionStart !== el.selectionEnd && isUrl(pasted)) {
            e.preventDefault();
            const s = el.selectionStart, en = el.selectionEnd;
            const md = `[${draft.slice(s, en).replace(/[\[\]]/g, "")}](${withScheme(pasted)})`;
            change(draft.slice(0, s) + md + draft.slice(en));
            requestAnimationFrame(() => el.setSelectionRange(s + md.length, s + md.length));
          }
        }}
        className={`${compact ? "w-full bg-sunken border border-line-3 rounded-md px-2 py-1.5 text-[13px] text-ink outline-none focus:border-mint-2" : "field font-normal text-[14px] leading-relaxed"} resize-none overflow-hidden ${className}`} />
      {link ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line-3 bg-panel p-2">
          <input className="field min-h-8 flex-1 min-w-[120px] text-[13px]" placeholder="Text to show" value={link.text}
            onChange={(e) => setLink({ ...link, text: e.target.value })} aria-label="Link text" />
          <input ref={urlInput} className="field min-h-8 flex-[2] min-w-[160px] text-[13px]" placeholder="Paste the link (https://…)" value={link.url}
            onChange={(e) => setLink({ ...link, url: e.target.value })} aria-label="Link URL"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") { e.preventDefault(); setLink(null); ta.current?.focus(); } }} />
          <button type="button" className="btn btn-primary min-h-8 px-3" disabled={!link.url.trim()} onClick={applyLink}>Link</button>
          <button type="button" className="btn btn-quiet min-h-8 px-2" onClick={() => { setLink(null); ta.current?.focus(); }}>Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openLink}
            className="inline-flex items-center gap-1 min-h-7 px-2 rounded-md border border-line-3 text-ink-2 hover:text-ink hover:border-ink-3 cursor-pointer">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
            Link
          </button>
          {!compact && <span>Select words, then ⌘K or paste a URL over them.</span>}
        </div>
      )}
    </div>
  );
}
