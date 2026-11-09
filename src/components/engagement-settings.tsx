"use client";
import { useState, useTransition } from "react";
import { updateEngagement, addSource, removeSource } from "@/actions/engagements";
import type { engagements, engagementSources } from "@/db/schema";
import { CATEGORIES } from "@/lib/constants";

type E = typeof engagements.$inferSelect;
type S = typeof engagementSources.$inferSelect;
const KIND_LABEL: Record<string, string> = { email_domain: "Email domain", slack_channel: "Slack channel id", aurasell_account: "Aurasell account id" };

export function EngagementSettings({ e, sources }: { e: E; sources: S[] }) {
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
    </div>
  );
}
