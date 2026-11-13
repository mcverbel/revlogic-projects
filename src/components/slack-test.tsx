"use client";

import { useState, useTransition } from "react";
import { testSlackDm } from "@/actions/slack-test";

export function SlackTest() {
  const [steps, setSteps] = useState<Awaited<ReturnType<typeof testSlackDm>> | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col"><span className="font-semibold">Slack notifications</span><span className="text-[13px] text-ink-3">Sends you a test DM and shows where it fails, if it does.</span></div>
        <button className="btn btn-ghost" disabled={pending} onClick={() => start(async () => setSteps(await testSlackDm()))}>{pending ? "Testing…" : "Send me a test Slack message"}</button>
      </div>
      {steps && (
        <ol className="m-0 pl-0 list-none flex flex-col gap-1.5 text-[13px]">
          {steps.map((s) => (
            <li key={s.step} className="flex gap-2"><span className={s.ok ? "text-mint" : "text-red"}>{s.ok ? "✓" : "✕"}</span><span><span className="font-medium">{s.step}:</span> <span className={s.ok ? "text-ink-2" : "text-ink"}>{s.detail}</span></span></li>
          ))}
        </ol>
      )}
    </div>
  );
}
