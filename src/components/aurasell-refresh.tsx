import { Icon } from "./ui";

/** Opens the scheduled Claude task that reads Aurasell calls, so it can be run right away. */
export function AurasellRefresh({ syncedAt, compact = false }: { syncedAt: string | null; compact?: boolean }) {
  const url = process.env.AURASELL_SYNC_TASK_URL;
  const last = syncedAt ? `Last synced ${new Date(syncedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Not synced yet";
  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "flex-wrap"}`}>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost no-underline text-ink" title="Opens the Aurasell sync in Claude. Press Run now there; new call tasks show up here within a few minutes.">
          <Icon name="spark" size={16} color="#7fdcae" />Refresh Aurasell
        </a>
      ) : (
        <span className="btn btn-ghost opacity-60 cursor-not-allowed" title="Available after the scheduled Claude task is set up">
          <Icon name="spark" size={16} />Refresh Aurasell
        </span>
      )}
      <span className="text-xs text-ink-3">{last}</span>
    </div>
  );
}
