"use client";

import { useEffect, useState } from "react";
import { listDriveFolder } from "@/actions/people-docs";
import { Icon } from "./ui";
import { fmtDate } from "@/lib/format";

type Item = { id: string; name: string; source: string; isFolder: boolean; url: string; modifiedTime: string | null };
type State = { loading: true } | { loading: false; ok: true; items: Item[] } | { loading: false; ok: false; reason: "no_google" | "no_access" };

const DOT: Record<string, string> = {
  "Google Slides": "#f2c27b", "Google Docs": "#8be3b7", "Google Sheets": "#7fdcae", PDF: "#ff8a80", Recording: "#c9a6f2", Image: "#8cc4f2",
};

/** Live list of what's inside a Drive folder. Subfolders open in place, files open in Drive. */
export function DriveFolder({ folderId, name }: { folderId: string; name: string }) {
  const [path, setPath] = useState<{ id: string; name: string }[]>([{ id: folderId, name }]);
  const [state, setState] = useState<State>({ loading: true });
  const current = path.at(-1)!;

  useEffect(() => {
    let live = true;
    setState({ loading: true });
    listDriveFolder(current.id).then((r) => live && setState({ loading: false, ...r } as State)).catch(() => live && setState({ loading: false, ok: false, reason: "no_access" }));
    return () => { live = false; };
  }, [current.id]);

  return (
    <div className="flex flex-col gap-2">
      <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-[13px] text-ink-3">
        {path.map((p, i) => (
          <span key={p.id} className="inline-flex items-center gap-1">
            {i > 0 && <Icon name="chevron" size={13} className="-rotate-90" />}
            {i < path.length - 1
              ? <button className="hover:text-ink underline-offset-2 hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>{p.name}</button>
              : <span className="text-ink font-medium">{p.name}</span>}
          </span>
        ))}
      </nav>
      <div className="rounded-lg border border-line overflow-hidden">
        {state.loading && <p className="m-0 px-4 py-6 text-[13px] text-ink-3">Loading files from Drive…</p>}
        {!state.loading && !state.ok && (
          <p className="m-0 px-4 py-6 text-[13px] text-ink-2">
            {state.reason === "no_google"
              ? "Sign out and back in with Google so the app can list this folder's files."
              : "Your Google account can't open this folder. Ask the owner to share it with you, then reopen it."}
          </p>
        )}
        {!state.loading && state.ok && state.items.length === 0 && <p className="m-0 px-4 py-6 text-[13px] text-ink-3">This folder is empty.</p>}
        {!state.loading && state.ok && state.items.length > 0 && (
          <ul className="m-0 p-0 list-none max-h-[420px] overflow-auto">
            {state.items.map((f) => (
              <li key={f.id} className="border-b border-line-2 last:border-b-0">
                {f.isFolder ? (
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#2f3131]" onClick={() => setPath([...path, { id: f.id, name: f.name }])}>
                    <Icon name="folder" size={17} className="text-ink-3 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-[14px] font-medium">{f.name}</span>
                    <Icon name="chevron" size={15} className="-rotate-90 text-ink-3" />
                  </button>
                ) : (
                  <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-2.5 no-underline text-ink hover:bg-[#2f3131]">
                    <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DOT[f.source] ?? "#9aa09d" }} />
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="truncate text-[14px]">{f.name}</span>
                      <span className="text-xs text-ink-3">{f.source}{f.modifiedTime ? ` · Updated ${fmtDate(f.modifiedTime)}` : ""}</span>
                    </span>
                    <Icon name="link" size={15} className="text-ink-3 shrink-0" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
