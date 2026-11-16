"use client";
import { useState, useTransition } from "react";
import { clearFramework, uploadFrameworks, type UploadResult } from "@/actions/revs";

export function FrameworkUpload() {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="card px-5 py-4 flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      start(async () => setResult(await uploadFrameworks(fd)));
    }}>
      <span className="text-[15px] font-semibold">Load frameworks from the spreadsheet</span>
      <span className="text-[13px] text-ink-2">Download the frameworks Sheet as .xlsx and upload it here. Each REV tab replaces that REV&apos;s framework; REVs not in the file stay as they are. Engagements that already have tasks keep them.</span>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".xlsx" required className="text-[13px]" aria-label="Frameworks spreadsheet" />
        <button className="btn btn-primary" disabled={pending}>{pending ? "Loading…" : "Load frameworks"}</button>
      </div>
      {result && !result.ok && <span role="alert" className="text-[13px] text-red">{result.error}</span>}
      {result?.ok && (
        <span role="status" className="text-[13px] text-mint-2">
          Loaded {result.loaded.map((l) => `${l.rev} (${l.milestones} milestones, ${l.tasks} tasks)`).join(", ")}.
          {result.skippedTabs.length > 0 && <span className="text-ink-3"> Skipped tabs: {result.skippedTabs.join(", ")}.</span>}
        </span>
      )}
    </form>
  );
}

export function ClearFramework({ rev }: { rev: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-quiet text-red" disabled={pending}
      onClick={() => confirm(`Remove the ${rev} framework? Engagements that already have its tasks keep them.`) && start(() => clearFramework(rev))}>
      Remove this framework
    </button>
  );
}
