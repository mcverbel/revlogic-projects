"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { linkTitle } from "@/actions/link-title";

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

type LinkDraft = { start: number; end: number; text: string; url: string; existing: boolean };

/**
 * Link tools for any textarea holding [text](url) links: ⌘K / Ctrl+K or the Link button opens a box (Text + Link);
 * pasting a URL over selected words links them; pasting a URL on its own offers its name (Tab), like Google Docs.
 */
export function useLinkTools({ draft, change, ta, box, onLeave }: {
  draft: string; change: (v: string) => void; ta: React.RefObject<HTMLTextAreaElement | null>;
  box: React.RefObject<HTMLElement | null>; onLeave?: () => void;
}) {
  const [link, setLink] = useState<LinkDraft | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const linkOpen = !!link;
  // Text in the link box filled in from the page or file name (so we never overwrite what someone typed).
  const [autoText, setAutoText] = useState<{ url: string; state: "loading" | "done" | "none" } | null>(null);
  // A URL just pasted on its own: offer its name ("Press Tab").
  const [suggest, setSuggest] = useState<{ start: number; url: string; title: string | null; loading: boolean } | null>(null);
  const titles = useRef(new Map<string, string | null>());
  const nameOf = async (u: string) => {
    const url = withScheme(u);
    if (titles.current.has(url)) return titles.current.get(url)!;
    const t = await linkTitle(url).catch(() => null);
    titles.current.set(url, t);
    return t;
  };

  // Focus once, when the link box opens (not on every keystroke).
  const placed = linkOpen && !!pos;
  useEffect(() => {
    if (!placed) return;
    (link?.text ? urlInput : textInput).current?.focus();
  }, [placed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!linkOpen) setPos(null); }, [linkOpen]);
  // The link box floats under the text box, so it never squeezes into narrow columns.
  useLayoutEffect(() => {
    if (!linkOpen) return;
    const place = () => {
      const r = ta.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(400, window.innerWidth - 24);
      const below = window.innerHeight - r.bottom > 220;
      setPos({ top: below ? r.bottom + 6 : Math.max(12, r.top - 210), left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)), width });
    };
    place();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [linkOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const inside = (n: Node | null) => !!n && (!!box.current?.contains(n) || !!pop.current?.contains(n));
  const backToText = (p?: number) => requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); if (p !== undefined) el.setSelectionRange(p, p); } });

  const openLink = () => {
    const el = ta.current;
    const [s, e] = el ? [el.selectionStart, el.selectionEnd] : [draft.length, draft.length];
    // Cursor on a link that's already there: edit that link.
    for (const m of draft.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
      const a = m.index!, b = a + m[0].length;
      if (s >= a && e <= b) { setLink({ start: a, end: b, text: m[1]!, url: m[2]!, existing: true }); return; }
    }
    setLink({ start: s, end: e, text: draft.slice(s, e), url: "", existing: false });
  };
  const applyLink = () => {
    if (!link) return;
    const url = link.url.trim();
    if (!url) { textInput.current?.focus(); return; }
    const md = `[${(link.text.trim() || shortUrl(withScheme(url))).replace(/[\[\]]/g, "")}](${withScheme(url)})`;
    change(draft.slice(0, link.start) + md + draft.slice(link.end));
    setLink(null);
    backToText(link.start + md.length);
  };
  const removeLink = () => {
    if (!link) return;
    change(draft.slice(0, link.start) + link.text + draft.slice(link.end));
    setLink(null);
    backToText(link.start + link.text.length);
  };
  const cancelLink = () => { setLink(null); backToText(); };
  /** Swap a pasted URL for its name, linked: https://docs.google.com/… → [Q3 deck](https://docs.google.com/…) */
  const applyName = () => {
    if (!suggest?.title) return;
    const { start, url, title } = suggest;
    setSuggest(null);
    if (draft.slice(start, start + url.length) !== url) return;
    const md = `[${title.replace(/[\[\]]/g, "")}](${url})`;
    change(draft.slice(0, start) + md + draft.slice(start + url.length));
    backToText(start + md.length);
  };
  const linkKeys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); applyLink(); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelLink(); }
  };

  /** Call from the textarea's onKeyDown. Returns true when it handled the key. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openLink(); return true; }
    if (e.key === "Tab" && !e.shiftKey && suggest?.title) { e.preventDefault(); applyName(); return true; }
    return false;
  };
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd && isUrl(pasted)) {
      e.preventDefault();
      const s = el.selectionStart, en = el.selectionEnd;
      const md = `[${draft.slice(s, en).replace(/[\[\]]/g, "")}](${withScheme(pasted)})`;
      change(draft.slice(0, s) + md + draft.slice(en));
      requestAnimationFrame(() => el.setSelectionRange(s + md.length, s + md.length));
    } else if (isUrl(pasted) && !pasted.trim().includes(" ")) {
      const url = withScheme(pasted);
      const s = el.selectionStart;
      e.preventDefault();
      change(draft.slice(0, s) + url + draft.slice(el.selectionEnd));
      requestAnimationFrame(() => el.setSelectionRange(s + url.length, s + url.length));
      setSuggest({ start: s, url, title: null, loading: true });
      nameOf(url).then((t) => setSuggest((g) => (g && g.url === url ? { ...g, title: t, loading: false } : g)));
    }
  };

  const toolbar = (hint?: string) => (
    <div className="flex items-center gap-2 text-[11.5px] text-ink-3 min-w-0">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={openLink} title="Link (⌘K)"
        className="inline-flex items-center gap-1 min-h-7 px-2 rounded-md border border-line-3 text-ink-2 hover:text-ink hover:border-ink-3 cursor-pointer shrink-0">
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
        Link
      </button>
      {suggest ? (
        suggest.loading ? <span>Getting the name…</span>
        : suggest.title ? (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">Press <kbd className="px-1 rounded border border-line-3 text-ink-2">Tab</kbd> to show “{suggest.title}”</span>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={applyName} className="text-mint hover:underline cursor-pointer shrink-0">Use name</button>
            <button type="button" aria-label="Keep the link as is" onMouseDown={(e) => e.preventDefault()} onClick={() => setSuggest(null)} className="text-ink-3 hover:text-ink cursor-pointer shrink-0">×</button>
          </span>
        ) : <span>Couldn&apos;t read that link&apos;s name. Select it and press ⌘K to name it.</span>
      ) : hint ? <span className="truncate">{hint}</span> : null}
    </div>
  );

  const popover = link && pos ? createPortal(
    <div ref={pop} role="dialog" aria-label={link.existing ? "Edit link" : "Add link"}
      onBlur={(e) => { if (!inside(e.relatedTarget as Node)) { setLink(null); onLeave?.(); } }}
      onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("input, button")) e.preventDefault(); }}
      className="fixed z-[120] rounded-xl border border-line-3 bg-panel shadow-[0_18px_50px_rgba(0,0,0,0.55)] p-3 flex flex-col gap-2.5"
      style={{ top: pos.top, left: pos.left, width: pos.width }}>
      <label className="flex flex-col gap-1 text-xs text-ink-3">Text
        <input ref={textInput} className="field min-h-9 text-[14px]" placeholder="Words people will see" value={link.text}
          onChange={(e) => { setAutoText(null); setLink({ ...link, text: e.target.value }); }} onKeyDown={linkKeys} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-3">Link
        <input ref={urlInput} className="field min-h-9 text-[14px]" placeholder="Paste the URL" value={link.url} inputMode="url"
          onChange={(e) => {
            const url = e.target.value;
            setLink((l) => (l ? { ...l, url } : l));
            const canFill = !link.text.trim() || autoText?.state === "done";
            if (isUrl(url) && canFill && !link.existing) {
              setAutoText({ url, state: "loading" });
              nameOf(url).then((t) => {
                setAutoText((a) => (a?.url === url ? { url, state: t ? "done" : "none" } : a));
                if (t) setLink((l) => (l && l.url === url ? { ...l, text: t } : l));
              });
            }
          }} onKeyDown={linkKeys} />
        {autoText?.url === link.url && autoText.state !== "done" && (
          <span className="text-[11.5px] text-ink-3">{autoText.state === "loading" ? "Getting the name…" : "Couldn't read the name. Type the text above."}</span>
        )}
      </label>
      <div className="flex items-center gap-2">
        {link.existing && <button type="button" className="btn btn-quiet min-h-8 px-2 text-ink-3 hover:text-red" onClick={removeLink}>Remove link</button>}
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn btn-ghost min-h-8 px-3" onClick={cancelLink}>Cancel</button>
          <button type="button" className="btn btn-primary min-h-8 px-3" disabled={!link.url.trim()} onClick={applyLink}>{link.existing ? "Save" : "Add link"}</button>
        </span>
      </div>
    </div>,
    document.body,
  ) : null;

  return { onKeyDown, onPaste, toolbar, popover, inside, reset: () => { setLink(null); setSuggest(null); } };
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
  const box = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useLayoutEffect(() => {
    const el = ta.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; }
  }, [draft, editing]);

  const change = (v: string) => { setDraft(v); onChange?.(v); };
  const finish = () => {
    tools.reset();
    if (draft !== value) onSave?.(draft);
    if (!editOnly) setEditing(false);
  };
  const tools = useLinkTools({ draft, change, ta, box, onLeave: finish });
  const startEdit = () => {
    setEditing(true);
    requestAnimationFrame(() => { const el = ta.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
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
      onBlur={(e) => { if (!tools.inside(e.relatedTarget as Node)) finish(); }}>
      <textarea ref={ta} aria-label={ariaLabel} value={draft} placeholder={placeholder} rows={compact ? 1 : minRows}
        autoFocus={autoFocus || !editOnly}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (tools.onKeyDown(e)) return;
          if (e.key === "Escape" && !editOnly) { e.preventDefault(); finish(); }
        }}
        onPaste={tools.onPaste}
        className={`${compact ? "w-full bg-sunken border border-line-3 rounded-md px-2 py-1.5 text-[13px] text-ink outline-none focus:border-mint-2" : "field font-normal text-[14px] leading-relaxed"} resize-none overflow-hidden ${className}`} />
      {tools.toolbar(compact ? undefined : "Select words, then ⌘K or paste a URL over them.")}
      {tools.popover}
    </div>
  );
}
