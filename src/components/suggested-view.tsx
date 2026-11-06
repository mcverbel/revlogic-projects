"use client";

import { PersonPicker } from "./person-picker";

import { useState, useTransition } from "react";
import type { suggestions as suggestionsT, users as usersT } from "@/db/schema";
import { acceptSuggestion, dismissSuggestion, undoSuggestion, editSuggestion, acceptAll, checkNow } from "@/actions/suggestions";
import { Avatar, Icon, Empty } from "./ui";
import { fmtDate } from "@/lib/format";

type S = typeof suggestionsT.$inferSelect;
type User = typeof usersT.$inferSelect;

const SRC: Record<string, { label: string; dot: string; open: string }> = {
  aurasell: { label: "Recording · Aurasell", dot: "#7fdcae", open: "Open recording" },
  otter: { label: "Recording · Otter", dot: "#8cc8ee", open: "Open in Otter" },
  gmail: { label: "Email · Gmail", dot: "#f2c27b", open: "Open email" },
  slack: { label: "Slack", dot: "#c9a6f2", open: "Open in Slack" },
};
const KIND: Record<string, [string, string, string]> = {
  task: ["revlogic task", "#23392f", "#8be3b7"],
  waiting_on_client: ["Waiting on client", "#43361f", "#f2c27b"],
  milestone_estimate: ["Milestone · Claude estimate", "#362b45", "#c9a6f2"],
};

export function SuggestedView({ engagementId, items, people, sourcesCount }: { engagementId: string; items: S[]; people: User[]; sourcesCount: number }) {
  const [filter, setFilter] = useState<"all" | "recordings" | "gmail" | "slack">("all");
  const [showDecided, setShowDecided] = useState(false);
  const [pending, start] = useTransition();
  const [checkMsg, setCheckMsg] = useState("");
  const match = (s: S) => filter === "all" || s.sources.some((x) => (filter === "recordings" ? x.provider === "aurasell" || x.provider === "otter" : x.provider === filter));
  const pendingItems = items.filter((s) => s.status === "pending");
  const decided = items.filter((s) => s.status !== "pending");
  const list = (showDecided ? decided : pendingItems).filter(match);
  const count = (f: typeof filter) => pendingItems.filter((s) => f === "all" || s.sources.some((x) => (f === "recordings" ? x.provider === "aurasell" || x.provider === "otter" : x.provider === f))).length;

  return (
    <section className="card border-[#2f6b4d] px-5 py-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <Icon name="spark" size={20} color="#7fdcae" />
            <h2 className="m-0 text-[17px] font-semibold">Suggested tasks</h2>
            <span className="pill bg-mint text-mint-ink font-semibold">{pendingItems.length} to review</span>
          </div>
          <span className="text-[13px] text-ink-2">From call recordings, email and Slack tied to this engagement ({sourcesCount} sources). Checked after calls and a few times a day.</span>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" disabled={pending} onClick={() => start(async () => { const r = await checkNow(engagementId); setCheckMsg(`Read ${r.read ?? 0} new items, ${r.created} new suggestions.`); })}>
            {pending ? "Checking…" : "Check now"}
          </button>
          {pendingItems.length > 0 && <button className="btn btn-primary" disabled={pending} onClick={() => start(() => acceptAll(engagementId))}>Accept all</button>}
        </div>
      </div>
      {checkMsg && <div className="text-[13px] text-mint">{checkMsg}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="seg" role="group" aria-label="Filter by source">
          {(["all", "recordings", "gmail", "slack"] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {{ all: "All", recordings: "Recordings", gmail: "Email", slack: "Slack" }[f]} <span className="text-xs text-ink-3">{count(f)}</span>
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" checked={showDecided} onChange={() => setShowDecided(!showDecided)} />Show accepted and dismissed</label>
      </div>

      {list.length === 0 && <Empty>{showDecided ? "Nothing decided yet." : sourcesCount === 0 ? "Add the client's email domain, Slack channels or Aurasell account on the Overview tab so Claude knows where to look." : "Nothing to review right now."}</Empty>}
      {list.map((s) => <Card key={s.id} s={s} people={people} />)}
      <p className="m-0 text-xs text-ink-3">Claude matches names to owners, turns spoken dates into due dates and checks for signs a task is already done. Nothing goes into the Plan until someone accepts it.</p>
    </section>
  );
}

function Card({ s, people }: { s: S; people: User[] }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const owners = s.ownerIds.map((id) => people.find((p) => p.id === id)).filter(Boolean) as User[];
  const [kLabel, kBg, kFg] = KIND[s.kind]!;
  const providers = [...new Set(s.sources.map((x) => x.provider))];
  const accepted = s.status === "accepted", dismissed = s.status === "dismissed";
  return (
    <article className="rounded-xl px-4 py-4 flex flex-wrap gap-4 items-start border"
      style={{ borderColor: accepted ? "#2f6b4d" : "#3d3f3f", background: accepted ? "#22302a" : "#282a29", opacity: dismissed ? 0.55 : 1 }}>
      <div className="flex-[1_1_420px] min-w-0 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {providers.map((p) => <span key={p} className="chip gap-1.5"><span className="w-[7px] h-[7px] rounded-full" style={{ background: SRC[p]?.dot }} />{SRC[p]?.label}</span>)}
          <span className="chip" style={{ background: kBg, color: kFg }}>{kLabel}</span>
          {accepted && <span className="text-xs text-mint-2 font-semibold">Added to Plan</span>}
          {dismissed && <span className="text-xs text-ink-3">Dismissed</span>}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <input className="field text-[15px]" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" />
            <div className="flex flex-wrap gap-2 items-center text-[13px]">
              <span className="text-ink-3">Owner</span>
              <PersonPicker people={people} value={s.ownerIds[0] ?? null} noneLabel="Not assigned" className="min-w-[220px]"
                onChange={(id) => start(() => editSuggestion(s.id, { ownerIds: id ? [id, ...s.ownerIds.slice(1).filter((x) => x !== id)] : s.ownerIds.slice(1) }))} />
              <span className="text-ink-3">Due</span>
              <input type="date" className="field w-auto" defaultValue={s.dueDate ?? ""} onChange={(e) => start(() => editSuggestion(s.id, { dueDate: e.target.value || null }))} />
            </div>
          </div>
        ) : <div className="text-[15.5px] font-semibold leading-snug">{title}</div>}
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-ink-2">
          <span className="inline-flex items-center gap-2"><span className="text-ink-3">Owner</span>
            {owners.length ? owners.map((o) => <span key={o.id} className="inline-flex items-center gap-1.5"><Avatar name={o.name} src={o.avatarUrl} size={24} />{o.name}</span>)
              : s.externalOwner ? <span>{s.externalOwner} (client)</span> : <span className="text-ink-3">Not assigned</span>}
          </span>
          <span className="inline-flex items-center gap-2"><span className="text-ink-3">Due</span>
            <span className={s.dueDate ? "text-ink font-semibold" : "text-ink-3"}>{s.dueDate ? fmtDate(s.dueDate) : s.dueText ? `"${s.dueText}"` : "Not set"}</span>
          </span>
        </div>
        {s.sources.map((src, i) => (
          <blockquote key={i} className="m-0 px-3.5 py-2.5 rounded-lg bg-bg border border-line-2 flex flex-col gap-1">
            <span className="flex flex-wrap justify-between gap-2 text-[11.5px] text-ink-3 font-mono"><span>{src.label}</span>
              {src.url && <a href={src.url} target="_blank" rel="noreferrer" className="font-sans no-underline">{SRC[src.provider]?.open}</a>}</span>
            <span className="text-[13.5px] leading-normal text-[#d5d8d6] italic">{src.quote}</span>
          </blockquote>
        ))}
        {s.looksDoneEvidence && s.status === "pending" && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#1f3a2c] border border-[#2f6b4d] text-[13px] leading-snug text-[#d5f3e3]">
            <span className="font-semibold text-mint whitespace-nowrap">Looks done</span><span>{s.looksDoneEvidence}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        {s.status === "pending" ? <>
          <button className="btn btn-primary min-h-10 min-w-[130px] justify-center" disabled={pending}
            onClick={() => start(() => acceptSuggestion(s.id, { asDone: !!s.looksDoneEvidence, title }))}>{s.looksDoneEvidence ? "Accept as done" : "Accept"}</button>
          <button className="btn btn-ghost min-h-10 min-w-[130px] justify-center" onClick={() => {
            if (editing && title !== s.title) start(() => editSuggestion(s.id, { title }));
            setEditing(!editing);
          }}>{editing ? "Done editing" : "Edit"}</button>
          <button className="btn btn-quiet min-h-10 min-w-[130px] justify-center" disabled={pending} onClick={() => start(() => dismissSuggestion(s.id))}>Dismiss</button>
        </> : <button className="btn btn-ghost min-h-10 min-w-[130px] justify-center" disabled={pending} onClick={() => start(() => undoSuggestion(s.id))}>Undo</button>}
      </div>
    </article>
  );
}
