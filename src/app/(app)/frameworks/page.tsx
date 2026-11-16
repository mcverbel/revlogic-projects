import { asc } from "drizzle-orm";
import { db } from "@/db";
import { frameworkSteps } from "@/db/schema";
import { REVS } from "@/lib/constants";
import { requireUser } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { FrameworkUpload, ClearFramework } from "@/components/framework-admin";

export default async function FrameworksPage() {
  const me = await requireUser();
  const steps = await db.select().from(frameworkSteps).orderBy(asc(frameworkSteps.rev), asc(frameworkSteps.sortOrder));
  const isAdmin = me.role === "admin";
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[28px] font-medium">REV frameworks</h1>
        <p className="m-0 text-[14px] text-ink-2 max-w-2xl">The standard milestones and tasks for each REV. When a REV is added to an engagement, its framework becomes phases and tasks on the plan, dated from the start date the person picks. People can still add their own tasks and accept Suggested tasks from Aurasell, email and Slack.</p>
      </div>
      {isAdmin && <FrameworkUpload />}
      <div className="flex flex-col gap-3">
        {REVS.map((r) => {
          const mine = steps.filter((s) => s.rev === r.id);
          const ms = mine.filter((s) => s.kind === "milestone").length;
          const weeks = mine.filter((s) => s.kind === "milestone").reduce((n, s) => n + s.durationWeeks, 0);
          return (
            <details key={r.id} className="card px-5 py-3.5 group">
              <summary className="flex flex-wrap items-center gap-3 cursor-pointer list-none">
                <span className="text-[16px] font-semibold">{r.label}</span>
                <span className="text-[13px] text-ink-3">{r.blurb}</span>
                <span className={`ml-auto text-[13px] ${mine.length ? "text-mint-2" : "text-ink-3"}`}>
                  {mine.length ? `${ms} milestones · ${mine.length - ms} tasks · ~${weeks} weeks · loaded ${fmtDate(mine[0]!.uploadedAt)}` : "No framework loaded"}
                </span>
              </summary>
              {mine.length > 0 && (
                <div className="mt-3 flex flex-col">
                  {mine.map((s) => s.kind === "milestone" ? (
                    <div key={s.id} className="flex items-center gap-2.5 py-2 border-t border-line-2 font-semibold text-[14px]">
                      <span className="w-2.5 h-2.5 rotate-45 bg-mint-2 shrink-0" />{s.title}<span className="ml-auto text-xs text-ink-3 font-normal">{s.durationWeeks} wk{s.durationWeeks === 1 ? "" : "s"}</span>
                    </div>
                  ) : (
                    <div key={s.id} className="flex items-start gap-2.5 py-1.5 pl-5 text-[13px] text-ink-2">
                      <span className="text-ink-3 w-8 shrink-0">{s.number}</span><span className="flex-1">{s.title}</span>
                      <span className="text-xs text-ink-3 whitespace-nowrap">{s.ownerRole ?? ""}{s.ownerRole ? " · " : ""}{s.durationWeeks} wk{s.durationWeeks === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                  {isAdmin && <div className="pt-3 border-t border-line-2"><ClearFramework rev={r.id} /></div>}
                </div>
              )}
            </details>
          );
        })}
      </div>
    </>
  );
}
