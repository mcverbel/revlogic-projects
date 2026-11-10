"use client";
import { useState, useTransition } from "react";
import { updateEngagement, addSource, removeSource } from "@/actions/engagements";
import type { engagements, engagementSources } from "@/db/schema";
import { CATEGORIES } from "@/lib/constants";
import { mergeEngagement, archiveEngagement, deleteEngagement } from "@/actions/merge";

type E = typeof engagements.$inferSelect;
type S = typeof engagementSources.$inferSelect;
const KIND_LABEL: Record<string, string> = { email_domain: "Email domain", slack_channel: "Slack channel id", aurasell_account: "Aurasell account id" };

export function EngagementSettings({ e, sources, others = [] }: { e: E; sources: S[]; others?: { id: string; label: string }[] }) {
  const [mergeInto, setMergeInto] = useState("");
  const [pending, start] = useTransition();
  const [kind, setKind] = useState("email_domain");
  const [value, setValue] = useState("");
  const save = (patch: Parameters<typeof updateEngagement>[1]) => start(() => updateEngagement(e.id, patch));
  return (
    <div className="card px-5 py-4 flex flex-col gap-4">
      <h2 className="m-0 text-[15px] font-semibold">Settings</h2>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">Menu section
          <select className="field" defaultValue={e.category === "creative" ? "creative_design" : e.category} onChange={(ev) => save({ category: ev.target.value })}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">Health
          <select className="field" defaultValue={e.health ?? "on_track"} onChange={(ev) => save({ health: ev.target.value })}>
            <option value="on_track">On track</option><option value="at_risk">At risk</option><option value="off_track">Off track</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">Drive folder
          <input className="field" defaultValue={e.driveFolderUrl ?? ""} onBlur={(ev) => ev.target.value !== (e.driveFolderUrl ?? "") && save({ driveFolderUrl: ev.target.value || null })} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">Aurasell opportunity id
          <input className="field" defaultValue={e.aurasellOpportunityId ?? ""} onBlur={(ev) => ev.target.value !== (e.aurasellOpportunityId ?? "") && save({ aurasellOpportunityId: ev.target.value || null })} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">Slack internal channel id
          <input className="field" defaultValue={e.slackInternalChannelId ?? ""} onBlur={(ev) => ev.target.value !== (e.slackInternalChannelId ?? "") && save({ slackInternalChannelId: ev.target.value || null })} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">Slack client channel id
          <input className="field" defaultValue={e.slackExternalChannelId ?? ""} onBlur={(ev) => ev.target.value !== (e.slackExternalChannelId ?? "") && save({ slackExternalChannelId: ev.target.value || null })} />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <span className="label-mono text-[11px]">Suggested tasks listen to</span>
        <div className="flex flex-wrap gap-2">
          {sources.length === 0 && <span className="text-[13px] text-ink-3">No sources yet. Add the client&apos;s email domain at least.</span>}
          {sources.map((s) => (
            <span key={`${s.kind}${s.value}`} className="chip gap-2">{KIND_LABEL[s.kind]}: {s.value}
              <button aria-label={`Remove ${s.value}`} className="text-ink-3 hover:text-red cursor-pointer" onClick={() => start(() => removeSource(e.id, s.kind, s.value))}>×</button>
            </span>
          ))}
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={(ev) => { ev.preventDefault(); start(async () => { await addSource(e.id, kind, value); setValue(""); }); }}>
          <select className="field w-auto" value={kind} onChange={(ev) => setKind(ev.target.value)}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input className="field flex-1 min-w-[160px]" value={value} onChange={(ev) => setValue(ev.target.value)} placeholder="hiddenlayer.com" aria-label="Source value" />
          <button className="btn btn-ghost" disabled={pending}>Add</button>
        </form>
      </div>
      <div className="flex flex-col gap-2 border-t border-line-2 pt-4">
        <span className="label-mono text-[11px]">Merge, archive or delete</span>
        <p className="m-0 text-[13px] text-ink-3">Merging moves this project&apos;s tasks, phases, team, contacts, docs and suggestions into the one you pick, then archives this one.</p>
        <div className="flex flex-wrap gap-2">
          <select className="field flex-1 min-w-[220px]" value={mergeInto} onChange={(ev) => setMergeInto(ev.target.value)} aria-label="Merge into">
            <option value="">Merge into…</option>
            {others.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button className="btn btn-ghost" disabled={pending || !mergeInto}
            onClick={() => { const t = others.find((o) => o.id === mergeInto); if (t && confirm(`Move everything from "${e.name}" into "${t.label}" and archive "${e.name}"?`)) start(() => mergeEngagement(e.id, mergeInto)); }}>
            Merge
          </button>
          <button className="btn btn-quiet text-ink-3" disabled={pending}
            onClick={() => { if (confirm(`Archive "${e.name}"? It disappears from the menu; its data is kept.`)) start(() => archiveEngagement(e.id)); }}>
            Archive
          </button>
          <button className="btn btn-quiet text-red" disabled={pending}
            onClick={() => { if (confirm(`Are you sure you want to delete "${e.name}"?\n\nThis permanently deletes the project and all its tasks, phases, docs, comments and suggestions. This can't be undone.`)) start(() => deleteEngagement(e.id)); }}>
            Delete project
          </button>
        </div>
      </div>
    </div>
  );
}
