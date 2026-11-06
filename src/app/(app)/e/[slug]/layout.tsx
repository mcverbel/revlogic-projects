import { loadEngagement } from "@/lib/load";
import { Icon } from "@/components/ui";
import { JourneyBar } from "@/components/journey-bar";
import { Tabs } from "@/components/tabs";
import { fmtDate, initials } from "@/lib/format";

const HEALTH: Record<string, [string, string, string]> = {
  on_track: ["#1f3a2c", "#8be3b7", "On track"], at_risk: ["#43361f", "#f2c27b", "At risk"], off_track: ["#452326", "#ff8a80", "Off track"],
};

export default async function EngagementLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { e, client, tasks, suggestions, members, contacts, docs } = await loadEngagement(slug);
  const [hbg, hfg, hlabel] = HEALTH[e.health ?? "on_track"] ?? HEALTH.on_track!;
  const slackUrl = (id: string) => `https://slack.com/app_redirect?channel=${id}`;
  return (
    <>
      <header className="flex flex-col gap-3.5">
        <div className="text-[13px] text-ink-3">Engagements / {client.name}</div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div aria-hidden className="w-12 h-12 rounded-xl bg-mint text-mint-ink flex items-center justify-center font-semibold text-lg shrink-0">{initials(client.name)}</div>
            <div className="flex flex-col gap-1 min-w-0">
              <h1 className="m-0 text-[28px] font-medium tracking-tight">{e.name}</h1>
              <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-ink-2">
                <span>{client.name}</span>
                {(e.startDate || e.endDate) && <><span className="text-[#5a5e5c]">|</span><span>{fmtDate(e.startDate)} – {fmtDate(e.endDate)}</span></>}
                {e.serviceLine && <span className="chip">{e.serviceLine}</span>}
                <span className="pill" style={{ background: hbg, color: hfg }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: hfg }} />{hlabel}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {e.driveFolderUrl && <a className="btn btn-ghost no-underline text-ink" href={e.driveFolderUrl} target="_blank" rel="noreferrer"><Icon name="folder" size={16} />Drive folder</a>}
            {e.aurasellOpportunityId && <span className="btn btn-ghost text-ink" title={`Synced ${e.dealStageSyncedAt ? fmtDate(e.dealStageSyncedAt) : "not yet"}`}><Icon name="link" size={16} />Aurasell deal</span>}
            {e.slackInternalChannelId && <a className="btn btn-ghost no-underline text-ink" href={slackUrl(e.slackInternalChannelId)} target="_blank" rel="noreferrer">Slack · internal</a>}
            {e.slackExternalChannelId && <a className="btn btn-ghost no-underline text-ink" href={slackUrl(e.slackExternalChannelId)} target="_blank" rel="noreferrer">Slack · client</a>}
          </div>
        </div>
        <JourneyBar engagementId={e.id} stage={e.journeyStage} synced={!!e.aurasellOpportunityId} />
        <Tabs slug={e.slug} counts={{
          plan: tasks.length, suggested: suggestions.filter((s) => s.status === "pending").length,
          people: members.length + contacts.length, docs: docs.length,
        }} />
      </header>
      {children}
    </>
  );
}
