"use client";

import { RichNotes } from "./rich-text";
import { PersonPicker } from "./person-picker";
import { FolderContents, TINT, type DriveItem } from "./drive-folder";

import { useState, useTransition } from "react";
import type { documents as docsT, users as usersT } from "@/db/schema";
import { addDocument, updateDocument, deleteDocument } from "@/actions/people-docs";
import { Empty, Icon } from "./ui";
import { DOC_TYPES } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

type Doc = typeof docsT.$inferSelect;
type User = typeof usersT.$inferSelect;

const CAT = { governance: { label: "Governance & Alignment", hint: "SOWs, contracts, kickoff decks, call recordings and email threads." }, deliverable: { label: "Deliverables & Client Assets", hint: "Decks, templates, workshops and custom content made for the client." } };
const folderId = (url: string) => url.match(/\/folders\/([A-Za-z0-9_-]{10,})/)?.[1] ?? null;
const previewUrl = (url: string) => { const id = url.match(/\/d\/([A-Za-z0-9_-]{20,})/)?.[1]; return id ? `https://drive.google.com/file/d/${id}/preview` : null; };

export function DocsView({ engagementId, docs, people }: { engagementId: string; docs: Doc[]; people: User[] }) {
  const [cat, setCat] = useState<"governance" | "deliverable">("governance");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState<Doc | null>(null);
  // A Drive folder opened inside the tab: the saved folder, plus the subfolders clicked into
  const [inFolder, setInFolder] = useState<{ doc: Doc; path: { id: string; name: string }[] } | null>(null);
  const [file, setFile] = useState<DriveItem | null>(null);
  const openDoc = (d: Doc) => { const fid = folderId(d.url); if (fid) setInFolder({ doc: d, path: [{ id: fid, name: d.title }] }); else setOpen(d); };
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ url: "", title: "", docType: "", notes: "" });
  const [pending, start] = useTransition();
  const shown = docs.filter((d) => d.category === cat);
  const owner = (id: string | null) => people.find((p) => p.id === id)?.name ?? "";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="seg">
          {(["governance", "deliverable"] as const).map((c) => (
            <button key={c} aria-pressed={cat === c} onClick={() => { setCat(c); setInFolder(null); }}>{CAT[c].label} <span className="text-xs text-ink-3">{docs.filter((d) => d.category === c).length}</span></button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="seg"><button aria-pressed={view === "grid"} onClick={() => setView("grid")}>Grid</button><button aria-pressed={view === "list"} onClick={() => setView("list")}>List</button></div>
          <button className="btn btn-primary min-h-11" onClick={() => setAdding(!adding)}>+ Add document</button>
        </div>
      </div>
      <p className="m-0 text-[13px] text-ink-2">{CAT[cat].hint}</p>

      {adding && (
        <form className="card p-4 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
          onSubmit={(e) => { e.preventDefault(); start(async () => { await addDocument(engagementId, { ...form, category: cat }); setAdding(false); setForm({ url: "", title: "", docType: "", notes: "" }); }); }}>
          <input className="field col-span-full" required placeholder="Paste a file link, a whole Google Drive folder, a Gmail thread or any link" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} aria-label="Document link" />
          <input className="field" placeholder="Title (filled from Drive if blank)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Title" />
          <select className="field" value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })} aria-label="Type">
            <option value="">Type…</option>{DOC_TYPES[cat].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className="field" placeholder="Note" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} aria-label="Note" />
          <button className="btn btn-primary min-h-[38px] justify-center" disabled={pending}>{pending ? "Adding…" : `Add to ${CAT[cat].label}`}</button>
        </form>
      )}

      {inFolder && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1.5 text-[14px] text-ink-3">
              <button className="hover:text-ink hover:underline underline-offset-2" onClick={() => setInFolder(null)}>{CAT[cat].label}</button>
              {inFolder.path.map((p, i) => (
                <span key={p.id} className="inline-flex items-center gap-1.5">
                  <Icon name="chevron" size={14} className="-rotate-90" />
                  {i < inFolder.path.length - 1
                    ? <button className="hover:text-ink hover:underline underline-offset-2" onClick={() => setInFolder({ ...inFolder, path: inFolder.path.slice(0, i + 1) })}>{p.name}</button>
                    : <span className="text-ink font-semibold inline-flex items-center gap-1.5"><Icon name="folder" size={16} />{p.name}</span>}
                </span>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <a className="btn btn-ghost no-underline" target="_blank" rel="noreferrer" href={`https://drive.google.com/drive/folders/${inFolder.path.at(-1)!.id}`}>Open in Drive</a>
              <button className="btn btn-ghost" onClick={() => setOpen(inFolder.doc)}>Folder details</button>
            </div>
          </div>
          <FolderContents key={inFolder.path.at(-1)!.id} folderId={inFolder.path.at(-1)!.id} view={view} onOpenFile={setFile}
            onPath={(f) => setInFolder({ ...inFolder, path: [...inFolder.path, f] })} />
        </>
      )}

      {!inFolder && shown.length === 0 && <div className="card"><Empty>No documents here yet.</Empty></div>}
      {inFolder ? null : view === "grid" ? (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {shown.map((d) => {
            const [bg, fg] = TINT[d.source ?? ""] ?? ["#373a39", "#d5d8d6"];
            return (
              <button key={d.id} onClick={() => openDoc(d)} className="card p-0 overflow-hidden text-left cursor-pointer flex flex-col hover:border-line-3">
                <span className="h-[92px] w-full flex items-end gap-1.5 px-3.5 py-3 box-border text-xs font-semibold" style={{ background: bg, color: fg }}>{folderId(d.url) && <Icon name="folder" size={15} />}{folderId(d.url) ? "Folder" : d.source ?? "Link"}</span>
                <span className="px-3.5 pt-3 pb-3.5 flex flex-col gap-1.5 w-full box-border">
                  {d.docType && <span className="label-mono text-[11px] tracking-wider">{d.docType}</span>}
                  <span className="font-semibold text-[14px] leading-snug">{d.title}</span>
                  {d.notes && <span className="text-xs text-ink-2 line-clamp-2">{d.notes}</span>}
                  <span className="flex items-center justify-between mt-1"><span className="chip">{d.status ?? "Draft"}</span><span className="text-xs text-ink-3">{fmtDate(d.updatedAt)}</span></span>
                </span>
              </button>
            );
          })}
        </div>
      ) : shown.length > 0 && (
        <div className="card overflow-x-auto"><div className="min-w-[820px]">
          <div className="grid grid-cols-[minmax(0,1fr)_140px_130px_110px_140px_90px] gap-3 px-4 py-3 text-xs font-semibold text-ink-3 border-b border-line"><span>Document</span><span>Type</span><span>Source</span><span>Status</span><span>Owner</span><span>Updated</span></div>
          {shown.map((d) => (
            <button key={d.id} onClick={() => openDoc(d)} className="grid w-full text-left grid-cols-[minmax(0,1fr)_140px_130px_110px_140px_90px] gap-3 px-4 py-3 border-b border-line-2 items-center cursor-pointer hover:bg-[#2f3131] text-[13px]">
              <span className="font-semibold text-[14px] inline-flex items-center gap-2">{folderId(d.url) && <Icon name="folder" size={16} className="text-ink-3" />}{d.title}</span><span className="text-ink-2">{d.docType}</span><span className="text-ink-2">{d.source}</span>
              <span><span className="chip">{d.status ?? "Draft"}</span></span><span className="text-ink-2">{owner(d.ownerId)}</span><span className="text-ink-3">{fmtDate(d.updatedAt)}</span>
            </button>
          ))}
        </div></div>
      )}

      {open && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <button aria-label="Close document" className="absolute inset-0 bg-[rgba(10,12,11,0.6)] cursor-pointer" onClick={() => setOpen(null)} />
          <aside aria-label="Document details" className="relative w-[560px] max-w-full h-full bg-panel overflow-y-auto box-border px-6 pt-5 pb-8 flex flex-col gap-4 shadow-[-8px_0_24px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5"><span className="text-xs text-ink-3">{CAT[open.category].label}{open.docType ? ` · ${open.docType}` : ""}</span><h2 className="m-0 text-xl font-semibold">{open.title}</h2></div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="btn btn-ghost w-11 h-11 justify-center p-0"><Icon name="x" size={18} /></button>
            </div>
            {folderId(open.url)
              ? null
              : previewUrl(open.url)
              ? <iframe title={`Preview of ${open.title}`} src={previewUrl(open.url)!} className="w-full h-[300px] rounded-lg border border-line bg-bg" />
              : <div className="h-[120px] rounded-lg border border-line flex items-center justify-center text-ink-3 text-[13px]">No preview for this link type</div>}
            <a href={open.url} target="_blank" rel="noreferrer" className="btn btn-primary self-start no-underline">{folderId(open.url) ? "Open folder in Drive" : `Open ${open.source ?? "link"}`}</a>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-[13px] items-center">
              <span className="text-ink-3">Status</span>
              <select className="field" defaultValue={open.status ?? "Draft"} onChange={(e) => start(() => updateDocument(open.id, { status: e.target.value }))}>
                {["Draft", "In review", "Final", "Sent", "Signed", "Reference"].map((s) => <option key={s}>{s}</option>)}
              </select>
              <span className="text-ink-3">Owner</span>
              <PersonPicker people={people} value={open.ownerId} noneLabel="No owner" onChange={(id) => start(() => updateDocument(open.id, { ownerId: id }))} />
              <span className="text-ink-3">Updated</span><span>{fmtDate(open.updatedAt)}</span>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-3">Notes
              <RichNotes key={open.id} value={open.notes ?? ""} className="font-normal text-[14px]" placeholder="Add a note" onSave={(v) => start(() => updateDocument(open.id, { notes: v || null }))} />
            </label>
            <button className="btn btn-quiet self-start hover:text-red" onClick={() => { if (confirm("Remove this document from the engagement? The file itself is not deleted.")) start(async () => { await deleteDocument(open.id); setOpen(null); }); }}>Remove from engagement</button>
          </aside>
        </div>
      )}
      {file && (
        <div className="fixed inset-0 z-30 flex justify-end">
          <button aria-label="Close file" className="absolute inset-0 bg-[rgba(10,12,11,0.6)] cursor-pointer" onClick={() => setFile(null)} />
          <aside aria-label="File preview" className="relative w-[560px] max-w-full h-full bg-panel overflow-y-auto box-border px-6 pt-5 pb-8 flex flex-col gap-4 shadow-[-8px_0_24px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5"><span className="text-xs text-ink-3">{file.source}{file.modifiedTime ? ` · Updated ${fmtDate(file.modifiedTime)}` : ""}</span><h2 className="m-0 text-xl font-semibold break-words">{file.name}</h2></div>
              <button onClick={() => setFile(null)} aria-label="Close" className="btn btn-ghost w-11 h-11 justify-center p-0"><Icon name="x" size={18} /></button>
            </div>
            <iframe title={`Preview of ${file.name}`} src={`https://drive.google.com/file/d/${file.id}/preview`} className="w-full h-[420px] rounded-lg border border-line bg-bg" />
            <a href={file.url} target="_blank" rel="noreferrer" className="btn btn-primary self-start no-underline">Open in Drive</a>
            <p className="m-0 text-xs text-ink-3">This file lives in the {inFolder?.path.at(-1)?.name ?? "linked"} folder in Google Drive.</p>
          </aside>
        </div>
      )}
    </section>
  );
}
