"use client";
import { useOptimistic, useTransition } from "react";
import { DEAL_STAGES, DELIVERY_STAGES, JOURNEY } from "@/lib/constants";
import { setJourneyStage } from "@/actions/engagements";

export function JourneyBar({ engagementId, stage, synced }: { engagementId: string; stage: string; synced: boolean }) {
  const [current, setCurrent] = useOptimistic(stage);
  const [, start] = useTransition();
  const idx = JOURNEY.findIndex((j) => j.id === current);
  const pick = (id: string) => start(async () => { setCurrent(id); await setJourneyStage(engagementId, id); });
  const step = (j: (typeof JOURNEY)[number], i: number) => {
    const on = i === idx, past = idx >= 0 && i < idx;
    return (
      <button key={j.id} type="button" onClick={() => pick(j.id)} aria-pressed={on} title={j.label}
        className="flex-1 min-w-0 flex flex-col gap-1.5 text-left cursor-pointer bg-transparent border-0 p-0 min-h-11">
        <span className="h-1.5 w-full rounded-full" style={{ background: on ? "#7fdcae" : past ? "#2f6b4d" : "#3d3f3f" }} />
        <span className={`text-[11.5px] leading-tight ${on ? "text-ink font-semibold" : past ? "text-ink-2" : "text-ink-3"}`}>{j.short}</span>
      </button>
    );
  };
  const label = current === "closed_lost" ? "Closed Lost" : current === "on_hold" ? "On hold" : JOURNEY[idx]?.label;
  return (
    <div className="card px-4 py-3.5 overflow-x-auto">
      <div className="flex gap-6 min-w-[900px]">
        <div className="flex flex-col gap-2" style={{ flex: "7 1 0" }}>
          <span className="label-mono text-[11px]">Deal · {synced ? "synced from Aurasell" : "marked by the team"}</span>
          <div className="flex gap-1">{DEAL_STAGES.map((j, i) => step(j, i))}</div>
        </div>
        <div className="flex flex-col gap-2" style={{ flex: "4 1 0" }}>
          <span className="label-mono text-[11px]">Delivery</span>
          <div className="flex gap-1">{DELIVERY_STAGES.map((j, i) => step(j, i + DEAL_STAGES.length))}</div>
        </div>
      </div>
      {(current === "closed_lost" || current === "on_hold") && <div className="mt-2 text-[13px] text-amber">Currently: {label}</div>}
    </div>
  );
}
