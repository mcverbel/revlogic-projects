"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { suggestions, tasks, taskAssignees, taskLinks, engagements, phases } from "@/db/schema";
import { asc } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { dmUser } from "@/lib/slack";
import { runSuggestionsForEngagement } from "@/lib/suggest";

export async function acceptSuggestion(id: string, opts?: { asDone?: boolean; title?: string }) {
  const me = await requireUser();
  const s = await db.query.suggestions.findFirst({ where: eq(suggestions.id, id) });
  if (!s || s.status !== "pending") return;
  const e = await db.query.engagements.findFirst({ where: eq(engagements.id, s.engagementId) });
  const title = opts?.title?.trim() || s.title;
  const [owner, ...others] = s.ownerIds;
  const [firstPhase] = await db.select().from(phases).where(eq(phases.engagementId, s.engagementId)).orderBy(asc(phases.sortOrder)).limit(1);
  const [t] = await db.insert(tasks).values({
    engagementId: s.engagementId, phaseId: firstPhase?.id ?? null, title, ownerId: owner ?? null, dueDate: s.dueDate, startDate: s.dueDate,
    isMilestone: s.kind === "milestone_estimate", waitingOnClient: s.kind === "waiting_on_client",
    status: opts?.asDone ? "done" : "not_started", completedAt: opts?.asDone ? new Date() : null,
    notes: [s.externalOwner ? `Client owner: ${s.externalOwner}` : "", s.dueText ? `Due as said: "${s.dueText}"` : ""].filter(Boolean).join("\n") || null,
    sourceSuggestionId: s.id, createdBy: me.id,
  }).returning();
  if (others.length) await db.insert(taskAssignees).values(others.map((userId) => ({ taskId: t!.id, userId })));
  const linked = s.sources.filter((src) => src.url);
  if (linked.length) await db.insert(taskLinks).values(linked.map((src) => ({ taskId: t!.id, label: src.label, url: src.url!, createdBy: me.id })));
  await db.update(suggestions).set({ status: "accepted", taskId: t!.id, decidedBy: me.id, decidedAt: new Date(), title }).where(eq(suggestions.id, id));
  await logActivity({ engagementId: s.engagementId, actorId: me.id, entityType: "task", entityId: t!.id, action: "created", summary: `accepted a suggested task: "${title}"${opts?.asDone ? " (already done)" : ""}` });
  if (owner && owner !== me.id && !opts?.asDone) await dmUser(owner, `${me.name} assigned you *${title}* on ${e?.name} (suggested from ${s.sources[0]?.label}). ${process.env.APP_URL ?? ""}/e/${e?.slug}/plan?task=${t!.id}`);
  revalidatePath("/", "layout");
}

export async function dismissSuggestion(id: string) {
  const me = await requireUser();
  await db.update(suggestions).set({ status: "dismissed", decidedBy: me.id, decidedAt: new Date() }).where(eq(suggestions.id, id));
  revalidatePath("/", "layout");
}

export async function undoSuggestion(id: string) {
  await requireUser();
  const s = await db.query.suggestions.findFirst({ where: eq(suggestions.id, id) });
  if (!s) return;
  if (s.taskId) await db.delete(tasks).where(eq(tasks.id, s.taskId));
  await db.update(suggestions).set({ status: "pending", taskId: null, decidedBy: null, decidedAt: null }).where(eq(suggestions.id, id));
  revalidatePath("/", "layout");
}

export async function editSuggestion(id: string, patch: { title?: string; ownerIds?: string[]; dueDate?: string | null }) {
  await requireUser();
  await db.update(suggestions).set(patch).where(eq(suggestions.id, id));
  revalidatePath("/", "layout");
}

export async function acceptAll(engagementId: string) {
  await requireUser();
  const pending = await db.select().from(suggestions).where(eq(suggestions.engagementId, engagementId));
  for (const s of pending.filter((p) => p.status === "pending" && p.kind !== "milestone_estimate")) await acceptSuggestion(s.id);
}

export async function checkNow(engagementId: string) {
  await requireUser();
  const r = await runSuggestionsForEngagement(engagementId);
  revalidatePath("/", "layout");
  return r;
}
