"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { brandClients } from "@/db/schema";
import { addBrandClient, updateBrandClient, deleteBrandClient } from "@/actions/design";
import { Icon, Empty } from "./ui";
import { fmtDate } from "@/lib/format";

type Client = typeof brandClients.$inferSelect;

/** Branding Templates: clients A–Z with notes. The circle moves a client to Past clients (and back). */
export function BrandTemplates({ engagementId, clients, canDelete }: { engagementId: string; clients: Client[]; canDelete: boolean }) {
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = q.trim().toLowerCase();
  const match = (c: Client) => !n || c.name.toLowerCase().includes(n) || (c.notes ?? "").toLowerCase().includes(n);
  const byName = (a: Client, b: Client) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const current = useMemo(() => clients.filter((c) => !c.isPast && match(c)).sort(byName), [clients, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const past = useMemo(() => clients.filter((c) => c.isPast && match(c)).sort(byName), [clients, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = clients.find((c) => c.id === openId) ?? null;

  const row = (c: Client) => (
    <div key={c.id} className="flex items-center gap-3 px-3 py-1.5 border-b border-line-2 last:border-b-0">
      <button type="button" aria-pressed={c.isPast} aria-label={c.isPast ? `Move ${c.name} back to current clients` : `Move ${c.name} to past clients`}
        title={c.isPast ? "Move back to current clients" : "Move to past clients"} onClick={() => start(() => updateBrandClient(c.id, { isPast: !c.isPast }))}
        className={`w-7 h-7 rounded-full border-2 inline-flex items-center justify-center cursor-pointer shrink-0 ${c.isPast ? "bg-mint-2 border-mint-2 text-mint-ink" : "border-line-3 text-transparent hover:border-mint-2 hover:text-mint-2"}`}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
      </button>
      <button type="button" onClick={() => setOpenId(c.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-10 cursor-pointer group">
        <span className={`text-[15px] font-medium truncate group-hover:underline underline-offset-4 decoration-line-3 ${c.isPast ? "text-ink-2" : "text-ink"}`}>{c.name}</span>
        <span className="text-xs text-ink-3 truncate">{c.notes?.trim() ? c.notes.trim().split("\n")[0] : "No notes yet"}</span>
      </button>
    </div>
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2.5 card px-3.5 min-h-12 flex-1 min-w-[240px]">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3 shrink-0"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" aria-label="Search clients" className="w-full bg-transparent text-[14px] text-ink placeholder:text-ink-3 outline-none" />
        </label>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const id = await addBrandClient(engagementId, name); setName(""); if (id) setOpenId(id); }); }}>
          <input className="field min-w-[200px]" placeholder="New client" value={name} onChange={(e) => setName(e.target.value)} aria-label="New client name" />
          <button className="btn btn-primary min-h-12" disabled={!name.trim() || pending}><Icon name="plus" size={16} />Add client</button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <span className="label-mono text-[11px] px-1">Clients · {current.length}</span>
        <div className="card">{current.length ? current.map(row) : <div className="p-4"><Empty>{n ? `No clients match “${q}”.` : "No clients yet."}</Empty></div>}</div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="label-mono text-[11px] px-1">Past clients · {past.length}</span>
        <div className="card">{past.length ? past.map(row) : <div className="p-4"><Empty>{n ? "None match." : "Check a client to move them here. Their notes stay."}</Empty></div>}</div>
      </div>

      {open && <ClientNotes key={open.id} c={open} engagementId={engagementId} canDelete={canDelete} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function ClientNotes({ c, engagementId, canDelete, onClose }: { c: Client; engagementId: string; canDelete: boolean; onClose: () => void }) {
  const [notes, setNotes] = useState(c.notes ?? "");
  const [name, setName] = useState(c.name);
  const [saved, setSaved] = useState(true);
  const [pending, start] = useTransition();
  // Save as she types (after a short pause), and when the window closes.
  useEffect(() => {
    if (notes === (c.notes ?? "")) return;
    setSaved(false);
    const id = setTimeout(() => start(async () => { await updateBrandClient(c.id, { notes }); setSaved(true); }), 700);
    return () => clearTimeout(id);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => {
    if (notes !== (c.notes ?? "") && !saved) start(() => updateBrandClient(c.id, { notes }));
    if (name.trim() && name !== c.name) start(() => updateBrandClient(c.id, { name }));
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  const links = notes.match(/https?:\/\/[^\s<>)]+/g) ?? [];
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-start justify-center p-4 pt-[10vh]" onClick={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label={`${c.name} notes`} className="card w-full max-w-2xl max-h-[80vh] overflow-auto p-5 flex flex-col gap-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3">
          <input className="flex-1 bg-transparent text-[20px] font-semibold text-ink outline-none rounded px-1 -mx-1 focus:bg-bg" value={name} onChange={(e) => setName(e.target.value)} aria-label="Client name" />
          <button aria-label="Close" className="btn btn-quiet px-2" onClick={close}><Icon name="x" size={16} /></button>
        </div>
        <textarea autoFocus className="field text-[14px] leading-relaxed min-h-[260px]" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={"Links to brand guidelines, logos, fonts, templates…\nhttps://drive.google.com/…"} aria-label={`Notes for ${c.name}`} />
        {links.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink-3">Links</span>
            {links.map((l, i) => <a key={i} href={l} target="_blank" rel="noreferrer" className="text-[13px] truncate">{l}</a>)}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
          <span>{pending || !saved ? "Saving…" : `Saved${c.updatedAt ? ` · ${fmtDate(c.updatedAt)}` : ""}`}</span>
          {canDelete && <button className="btn btn-quiet text-red" onClick={() => { if (confirm(`Delete ${c.name} and its notes?`)) { start(() => deleteBrandClient(engagementId, c.id)); onClose(); } }}>Delete client</button>}
        </div>
      </div>
    </div>
  );
}
