"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { createMigrationToken } from "@/actions/asana-migration";

/** The prompt Melissa pastes into her own Claude. Her Claude reads Asana with her Asana connector and writes here with the tracker connector. */
export const ASANA_MIGRATION_PROMPT = `Migrate my completed Asana design tasks into revlogic Projects (the Graphic Design board). Read Asana with my Asana connector. Only read from Asana: don't change, complete, move or comment on anything there.

The app is reached with plain HTTP (use Bash + curl). Write the JSON body to a file and send it with -d @file:
  curl -s -X POST https://revlogic-projects.vercel.app/api/mcp -H 'Content-Type: application/json' -H 'Authorization: Bearer PASTE_MY_TOKEN_HERE' -d @body.json
where body.json is {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"import_asana_completed_tasks","arguments":{"dry_run":true,"tasks":[...]}}}

1. List my Asana projects and ask me which ones to migrate. Wait for my answer.
2. For each project I pick, get its completed tasks only (completed = true; skip open tasks). For each task collect:
   - asana_id (gid), title (name), completed_at, due_date (due_on, if set)
   - assignee: name and email
   - requester: name and email from a "Requester" (or similar) field if the task has one, otherwise the task's creator
   - notes (plain text), url (permalink_url), project (the project name)
   - client: the client or brand from a custom field, if the task has one
   - attachments: name and view_url (or permanent_url)
   - comments: only stories of type "comment", with author name and email, created_at, and text
3. Do a dry run first: send the tasks with dry_run: true, in batches of up to 50. Show me the totals: tasks that would be imported, already imported, skipped, and people not found in the app. Ask me to confirm.
4. After I confirm, send the same batches again with dry_run: false.
5. Finish with how many tasks were imported per project, and list anyone who wasn't found in the app.

Never invent anything: leave out any field Asana doesn't have. If a call fails, stop and show me the error.`;

export function AsanaMigration({ engagementId, imported }: { engagementId: string; imported: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState(ASANA_MIGRATION_PROMPT);
  // Each copy makes a fresh 24-hour token and puts it in the prompt, so there's nothing to set up or replace.
  const copy = async () => {
    setBusy(true); setError("");
    try {
      const text = ASANA_MIGRATION_PROMPT.replace("PASTE_MY_TOKEN_HERE", await createMigrationToken(engagementId));
      setPrompt(text);
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* the prompt below is filled in and selectable */ }
    } catch (e) { setError((e as Error).message || "Couldn't create the prompt. Try again."); }
    setBusy(false);
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn btn-ghost text-ink" onClick={() => setOpen(true)}>One-time Asana migration</button>
      {imported > 0 && <span className="text-xs text-ink-3">{imported} task{imported === 1 ? "" : "s"} imported from Asana so far</span>}
      {open && createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="asana-title" className="card w-full max-w-[640px] my-8 p-5 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="asana-title" className="m-0 text-[17px] font-semibold">One-time Asana migration</h2>
              <button type="button" aria-label="Close" className="text-ink-3 hover:text-ink text-xl leading-none cursor-pointer" onClick={() => setOpen(false)}>×</button>
            </div>
            <p className="m-0 text-[13.5px] text-ink-2 leading-relaxed">
              Your own Claude moves your completed Asana tasks into the Completed tab. You choose the projects, and nothing changes in Asana. Running it again skips tasks that already came over.
            </p>
            <ol className="m-0 pl-5 list-decimal flex flex-col gap-2.5 text-[13.5px] leading-relaxed">
              <li>Click <b>Copy prompt</b>.</li>
              <li>Paste it into a new <b>Cowork</b> task (Asana needs to be connected in Claude) and follow along. It asks which projects to move and shows a dry run before importing.</li>
            </ol>
            <p className="m-0 text-xs text-ink-3">The prompt includes a key that lets your Claude add tasks to this app as you. It stops working after 24 hours. Don&apos;t share the prompt.</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="label-mono text-[11px]">Prompt</span>
                <button type="button" className="btn btn-primary" onClick={copy} disabled={busy}>{busy ? "Preparing…" : copied ? "Copied" : "Copy prompt"}</button>
              </div>
              {error && <span role="alert" className="text-[13px] text-red">{error}</span>}
              <textarea readOnly value={prompt} aria-label="Migration prompt" rows={12}
                className="w-full rounded-lg border border-line-2 bg-sunken p-3 text-[12.5px] text-ink-2 leading-relaxed resize-y" onFocus={(e) => e.currentTarget.select()} />
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
