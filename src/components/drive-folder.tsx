"use client";

import { useEffect, useState } from "react";
import { listDriveFolder } from "@/actions/people-docs";
import { Empty, Icon } from "./ui";
import { fmtDate } from "@/lib/format";

export type DriveItem = { id: string; name: string; source: string; isFolder: boolean; url: string; modifiedTime: string | null };
type State = { loading: true } | { loading: false; ok: true; items: DriveItem[] } | { loading: false; ok: false; reason: "no_google" | "no_access" };

export const TINT: Record<string, [string, string]> = {
  "Google Slides": ["#43361f", "#f2c27b"], "Google Docs": ["#23392f", "#8be3b7"], "Google Sheets": ["#1f3a2c", "#7fdcae"],
  PDF: ["#452326", "#ff8a80"], Recording: ["#362b45", "#c9a6f2"], Gmail: ["#373a39", "#d5d8d6"], Image: ["#22323d", "#8cc4f2"],
  "Drive folder": ["#22323d", "#8cc4f2"],
};

/**
 * A Drive folder opened inside the Docs tab: same grid and list views as documents.
 * Files are read live from Drive with the viewer's Google access; subfolders open in place.
 */
export function FolderContents({ folderId, view, onOpenFile, onPath }: {
  folderId: string; view: "grid" | "list"; onOpenFile: (f: DriveItem) => void; onPath: (folder: { id: string; name: string }) => void;
}) {
  const [state, setState] = useState<State>({ loading: true });

  useEffect(() => {
    let live = true;
    setState({ loading: true });
    listDriveFolder(folderId).then((r) => live && setState({ loading: false, ...r } as State)).catch(() => live && setState({ loading: false, ok: false, reason: "no_access" }));
    return () => { live = false; };
  }, [folderId]);

  if (state.loading) return <div className="card"><Empty>Loading files from Drive…</Empty></div>;
  if (!state.ok) return (
    <div className="card"><Empty>
      {state.reason === "no_google"
        ? "Sign out and back in with Google so the app can list this folder's files."
        : "Your Google account can't open this folder. Ask the owner to share it with you, then reopen it."}
    </Empty></div>
  );
  if (!state.items.length) return <div className="card"><Empty>This folder is empty.</Empty></div>;

  const open = (f: DriveItem) => (f.isFolder ? onPath({ id: f.id, name: f.name }) : onOpenFile(f));

  return view === "grid" ? (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
      {state.items.map((f) => {
        const [bg, fg] = TINT[f.source] ?? ["#373a39", "#d5d8d6"];
        return (
          <button key={f.id} onClick={() => open(f)} className="card p-0 overflow-hidden text-left cursor-pointer flex flex-col hover:border-line-3">
            <span className="h-[92px] w-full flex items-end gap-1.5 px-3.5 py-3 box-border text-xs font-semibold" style={{ background: bg, color: fg }}>
              {f.isFolder && <Icon name="folder" size={15} />}{f.isFolder ? "Folder" : f.source}
            </span>
            <span className="px-3.5 pt-3 pb-3.5 flex flex-col gap-1.5 w-full box-border">
              <span className="font-semibold text-[14px] leading-snug break-words">{f.name}</span>
              <span className="text-xs text-ink-3">{f.isFolder ? "Open folder" : f.modifiedTime ? `Updated ${fmtDate(f.modifiedTime)}` : ""}</span>
            </span>
          </button>
        );
      })}
    </div>
  ) : (
    <div className="card overflow-x-auto"><div className="min-w-[620px]">
      <div className="grid grid-cols-[minmax(0,1fr)_160px_120px] gap-3 px-4 py-3 text-xs font-semibold text-ink-3 border-b border-line"><span>Name</span><span>Type</span><span>Updated</span></div>
      {state.items.map((f) => (
        <button key={f.id} onClick={() => open(f)} className="grid w-full text-left grid-cols-[minmax(0,1fr)_160px_120px] gap-3 px-4 py-3 border-b border-line-2 items-center cursor-pointer hover:bg-[#2f3131] text-[13px]">
          <span className="flex items-center gap-2.5 min-w-0">
            {f.isFolder ? <Icon name="folder" size={16} className="text-ink-3 shrink-0" /> : <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: (TINT[f.source] ?? ["", "#9aa09d"])[1] }} />}
            <span className="font-semibold text-[14px] truncate">{f.name}</span>
          </span>
          <span className="text-ink-2">{f.isFolder ? "Folder" : f.source}</span>
          <span className="text-ink-3">{f.modifiedTime ? fmtDate(f.modifiedTime) : ""}</span>
        </button>
      ))}
    </div></div>
  );
}
