"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { createMigrationToken } from "@/actions/asana-migration";

/** The prompt for ChatGPT or Claude once revlogic Projects is connected (signed in with Google). No key needed. */
export const CONNECTOR_PROMPT = `Migrate my completed Asana tasks into revlogic Projects (the Graphic Design board) using the revlogic Projects app's import_asana_completed_tasks action. Read Asana with my Asana app. Only read from Asana: don't change anything there.

1. Ask me which Asana projects to migrate.
2. Get only the completed tasks. For each: asana_id, title, completed_at, due_date, assignee (name, email), requester (a Requester field if there is one, otherwise the creator), notes, url, project, client (if there's a field for it), attachments (name, url) and comments (author, date, text).
3. Do a dry run first (dry_run: true, up to 50 tasks per call). Show me the totals and anyone not found in the app, and ask me to confirm.
4. After I confirm, import them (dry_run: false) and tell me how many came over per project.

Never invent anything: leave out fields Asana doesn't have. If something fails, stop and show me the error.`;

/** Backup: the prompt Melissa pastes into her own Claude. Her Claude reads Asana with her Asana connector and writes here with the tracker connector. */
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
              Your ChatGPT (or Claude) moves your completed Asana tasks into the Completed tab. You pick the projects, it shows a dry run first, and nothing changes in Asana. Running it again skips tasks that already came over.
            </p>
            <ol className="m-0 pl-5 list-decimal flex flex-col gap-2.5 text-[13.5px] leading-relaxed">
              <li>In ChatGPT, make sure <b>Asana</b> and <b>revlogic Projects</b> are both connected. The first time, revlogic Projects asks you to sign in with Google and click Allow.</li>
              <li>Copy the prompt below and send it in a new chat.</li>
            </ol>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="label-mono text-[11px]">Prompt</span>
                <button type="button" className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(CONNECTOR_PROMPT).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => {}); }}>{copied ? "Copied" : "Copy prompt"}</button>
              </div>
              <textarea readOnly value={CONNECTOR_PROMPT} aria-label="Migration prompt" rows={10}
                className="w-full rounded-lg border border-line-2 bg-sunken p-3 text-[12.5px] text-ink-2 leading-relaxed resize-y" onFocus={(e) => e.currentTarget.select()} />
            </div>
            <details className="border-t border-line-2 pt-3">
              <summary className="text-[13px] text-ink-3 cursor-pointer">Using Claude Cowork without the connector?</summary>
              <div className="flex flex-col gap-2 pt-3">
                <p className="m-0 text-xs text-ink-3">This version includes a key that lets Claude add tasks to this app as you. It stops working after 24 hours. Don&apos;t share it.</p>
                <div className="flex justify-end"><button type="button" className="btn btn-ghost text-ink" onClick={copy} disabled={busy}>{busy ? "Preparing…" : "Copy Cowork prompt"}</button></div>
                {error && <span role="alert" className="text-[13px] text-red">{error}</span>}
                {prompt !== ASANA_MIGRATION_PROMPT && <textarea readOnly value={prompt} aria-label="Cowork migration prompt" rows={6}
                  className="w-full rounded-lg border border-line-2 bg-sunken p-3 text-[12.5px] text-ink-2 leading-relaxed resize-y" onFocus={(e) => e.currentTarget.select()} />}
              </div>
            </details>
          </div>
        </div>, document.body)}
    </div>
  );
}
