import { and, isNotNull, isNull, eq } from "drizzle-orm";
import { db } from "@/db";
import { engagements } from "@/db/schema";
import { aurasellDealStage } from "@/lib/sources/aurasell";
import { journeyFromAurasellStage, isPursuit } from "@/lib/constants";
import { logActivity } from "@/lib/activity";

/** Aurasell is the source of truth for deal stages once an opportunity is linked. Delivery stages are never overwritten. */
export async function syncDealStages() {
  const list = await db.select().from(engagements).where(and(isNotNull(engagements.aurasellOpportunityId), isNull(engagements.archivedAt)));
  let changed = 0;
  for (const e of list) {
    if (!isPursuit(e.journeyStage)) continue;
    try {
      const d = await aurasellDealStage(e.aurasellOpportunityId!);
      if (!d) continue;
      const next = journeyFromAurasellStage(d.stage, d.status);
      if (!next || next === e.journeyStage) {
        await db.update(engagements).set({ dealStageSyncedAt: new Date() }).where(eq(engagements.id, e.id));
        continue;
      }
      const stage = (next === "closed_won" ? "kickoff" : next) as typeof engagements.$inferInsert.journeyStage;
      await db.update(engagements).set({ journeyStage: stage, dealStageSyncedAt: new Date(), archivedAt: next === "closed_lost" ? new Date() : null }).where(eq(engagements.id, e.id));
      await logActivity({ engagementId: e.id, entityType: "engagement", entityId: e.id, action: "stage_changed", summary: `Aurasell moved the deal to ${d.stage}` });
      changed++;
    } catch (err) {
      console.warn("deal sync failed", e.slug, err);
    }
  }
  return { checked: list.length, changed };
}
