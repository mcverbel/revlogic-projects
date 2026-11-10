"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  engagements, phases, tasks, engagementMembers, clientContacts, documents, comments, activityLog,
  engagementSources, suggestions, processedItems,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";

/**
 * Move everything from one project into another, then archive the first one.
 * Phases with the same name are combined; nothing is deleted except the empty duplicate phases.
 */
export async function mergeEngagement(sourceId: string, targetId: string) {
  const me = await requireUser();
  if (sourceId === targetId) throw new Error("Pick a different project");
  const [source, target] = await Promise.all([
    db.query.engagements.findFirst({ where: eq(engagements.id, sourceId) }),
    db.query.engagements.findFirst({ where: eq(engagements.id, targetId) }),
  ]);
  if (!source || !target || source.archivedAt || target.archivedAt) throw new Error("Project not found");

  await db.transaction(async (tx) => {
    // Phases: combine same-named ones, move the rest to the end of the target's list
    const targetPhases = await tx.select().from(phases).where(eq(phases.engagementId, targetId));
    const sourcePhases = await tx.select().from(phases).where(eq(phases.engagementId, sourceId));
    let order = Math.max(-1, ...targetPhases.map((p) => p.sortOrder)) + 1;
    for (const p of sourcePhases) {
      const same = targetPhases.find((t) => t.name.trim().toLowerCase() === p.name.trim().toLowerCase());
      if (same) {
        await tx.update(tasks).set({ phaseId: same.id }).where(eq(tasks.phaseId, p.id));
        await tx.delete(phases).where(eq(phases.id, p.id));
      } else {
        await tx.update(phases).set({ engagementId: targetId, sortOrder: order++ }).where(eq(phases.id, p.id));
      }
    }

    // Records that simply move
    await tx.update(tasks).set({ engagementId: targetId }).where(eq(tasks.engagementId, sourceId));
    await tx.update(clientContacts).set({ engagementId: targetId }).where(eq(clientContacts.engagementId, sourceId));
    await tx.update(documents).set({ engagementId: targetId }).where(eq(documents.engagementId, sourceId));
    await tx.update(comments).set({ engagementId: targetId }).where(eq(comments.engagementId, sourceId));
    await tx.update(suggestions).set({ engagementId: targetId }).where(eq(suggestions.engagementId, sourceId));
    await tx.update(activityLog).set({ engagementId: targetId }).where(eq(activityLog.engagementId, sourceId));

    // Records keyed by engagement: copy without duplicates, then remove from the source
    await tx.execute(sql`insert into engagement_members (engagement_id, user_id, project_role, tags)
      select ${targetId}, user_id, project_role, tags from engagement_members where engagement_id = ${sourceId}
      on conflict do nothing`);
    await tx.delete(engagementMembers).where(eq(engagementMembers.engagementId, sourceId));
    await tx.execute(sql`insert into engagement_sources (engagement_id, kind, value)
      select ${targetId}, kind, value from engagement_sources where engagement_id = ${sourceId}
      on conflict do nothing`);
    await tx.delete(engagementSources).where(eq(engagementSources.engagementId, sourceId));
    await tx.execute(sql`insert into processed_items (provider, external_id, engagement_id)
      select provider, external_id, ${targetId} from processed_items where engagement_id = ${sourceId}
      on conflict do nothing`);
    await tx.delete(processedItems).where(eq(processedItems.engagementId, sourceId));

    // Keep any details the target is missing
    await tx.update(engagements).set({
      driveFolderUrl: target.driveFolderUrl ?? source.driveFolderUrl,
      slackInternalChannelId: target.slackInternalChannelId ?? source.slackInternalChannelId,
      slackExternalChannelId: target.slackExternalChannelId ?? source.slackExternalChannelId,
      aurasellOpportunityId: target.aurasellOpportunityId ?? source.aurasellOpportunityId,
      startDate: target.startDate ?? source.startDate,
      endDate: target.endDate ?? source.endDate,
      description: target.description ?? source.description,
      updatedAt: new Date(),
    }).where(eq(engagements.id, targetId));

    await tx.update(engagements).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(engagements.id, sourceId)));
  });

  await logActivity({ engagementId: targetId, actorId: me.id, entityType: "engagement", entityId: targetId, action: "updated", summary: `merged "${source.name}" into this project` });
  revalidatePath("/", "layout");
  redirect(`/e/${target.slug}/plan`);
}

/** Hide a project from the menu. Its data is kept. */
export async function archiveEngagement(id: string) {
  const me = await requireUser();
  await db.update(engagements).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(engagements.id, id));
  await logActivity({ engagementId: id, actorId: me.id, entityType: "engagement", entityId: id, action: "updated", summary: "archived this project" });
  revalidatePath("/", "layout");
  redirect("/");
}

/** Permanently delete a project and everything in it (tasks, phases, docs, comments, suggestions). */
export async function deleteEngagement(id: string) {
  await requireUser();
  await db.delete(engagements).where(eq(engagements.id, id));
  revalidatePath("/", "layout");
  redirect("/");
}
