import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { loadEngagement } from "@/lib/load";
import { SuggestedView } from "@/components/suggested-view";
import { AurasellRefresh } from "@/components/aurasell-refresh";

export default async function SuggestedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { e, suggestions, people, sources } = await loadEngagement(slug);
  const sync = await db.query.connections.findFirst({ where: and(eq(connections.scope, "company"), eq(connections.provider, "aurasell_sync")) });
  const hasAurasell = sources.some((s) => s.kind === "aurasell_account");
  return (
    <>
      {hasAurasell && (
        <div className="flex flex-wrap items-center justify-between gap-3 card px-5 py-3">
          <span className="text-[13px] text-ink-2">Aurasell calls sync automatically a few times a day. Just had a call? Refresh to pull its next steps now.</span>
          <AurasellRefresh syncedAt={sync?.lastSyncedAt?.toISOString() ?? null} />
        </div>
      )}
      <SuggestedView engagementId={e.id} items={suggestions} people={people} sourcesCount={sources.length} />
    </>
  );
}
