"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { tasks, taskAssignees, taskLinks, userTaskPrefs, comments, phases, engagements, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { dmUser, postToChannel } from "@/lib/slack";
import { TASK_STATUSES } from "@/lib/constants";

type TaskPatch = Partial<{
  title: string; description: string | null; notes: string | null; ownerId: string | null; status: typeof tasks.$inferInsert.status;
  priority: typeof tasks.$inferInsert.priority; startDate: string | null; dueDate: string | null; isMilestone: boolean; phaseId: string | null; waitingOnClient: boolean;
}>;

async function taskWithEngagement(taskId: string) {
  const t = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!t) throw new Error("Task not found");
  const e = await db.query.engagements.findFirst({ where: eq(engagements.id, t.engagementId) });
  return { t, e: e! };
}
const who = (me: { id: string; name: string }, uid: string, verb: string) => (uid === me.id ? `You ${verb} yourself` : `${me.name} ${verb} you`);
const link = (slug: string, taskId: string) => `${process.env.APP_URL ?? ""}/e/${slug}/plan?task=${taskId}`;

export async function createTask(engagementId: string, input: {
  title: string; phaseId?: string | null; ownerId?: string | null; dueDate?: string | null; startDate?: string | null; isMilestone?: boolean;
  assigneeIds?: string[]; status?: (typeof tasks.$inferInsert)["status"]; priority?: (typeof tasks.$inferInsert)["priority"];
  notes?: string | null; waitingOnClient?: boolean;
}) {
  const me = await requireUser();
  if (!input.title.trim()) return;
  const [t] = await db.insert(tasks).values({
    engagementId, title: input.title.trim(), phaseId: input.phaseId || null, ownerId: input.ownerId || null,
    dueDate: input.dueDate || null, startDate: input.startDate || input.dueDate || null, isMilestone: !!input.isMilestone,
    status: input.status ?? "not_started", priority: input.priority ?? "medium", notes: input.notes || null,
    waitingOnClient: !!input.waitingOnClient, completedAt: input.status === "done" ? new Date() : null, createdBy: me.id,
  }).returning();
  const assignees = [...new Set(input.assigneeIds ?? [])].filter((id) => id !== t!.ownerId);
  if (assignees.length) await db.insert(taskAssignees).values(assignees.map((userId) => ({ taskId: t!.id, userId })));
  await logActivity({ engagementId, actorId: me.id, entityType: "task", entityId: t!.id, action: "created", summary: `added task "${t!.title}"` });
  if (t!.ownerId) {
    const e = await db.query.engagements.findFirst({ where: eq(engagements.id, engagementId) });
    await dmUser(t!.ownerId, `${who(me, t!.ownerId, "assigned")} *${t!.title}* on ${e?.name}${t!.dueDate ? ` (due ${t!.dueDate})` : ""}. ${link(e!.slug, t!.id)}`);
  }
  if (assignees.length) {
    const e = await db.query.engagements.findFirst({ where: eq(engagements.id, engagementId) });
    for (const uid of assignees) await dmUser(uid, `${who(me, uid, "added")} to *${t!.title}* on ${e?.name}. ${link(e!.slug, t!.id)}`);
  }
  revalidatePath("/", "layout");
  return t!.id;
}

export async function updateTask(taskId: string, patch: TaskPatch) {
  const me = await requireUser();
  const { t: before, e } = await taskWithEngagement(taskId);
  const set: Record<string, unknown> = { ...patch, updatedAt: new Date() };
  if (patch.status) set.completedAt = patch.status === "done" ? new Date() : null;
  await db.update(tasks).set(set).where(eq(tasks.id, taskId));

  if (patch.status && patch.status !== before.status) {
    const label = TASK_STATUSES.find((s) => s.id === patch.status)?.label;
    await logActivity({ engagementId: e.id, actorId: me.id, entityType: "task", entityId: taskId, action: "status_changed", summary: `marked "${before.title}" ${label}` });
    if (patch.status === "done" && before.isMilestone) await postToChannel(e.slackInternalChannelId, `:white_check_mark: Milestone done on ${e.name}: *${before.title}*`);
  } else if (patch.ownerId && patch.ownerId !== before.ownerId) {
    await logActivity({ engagementId: e.id, actorId: me.id, entityType: "task", entityId: taskId, action: "assigned", summary: `changed the owner of "${before.title}"` });
    await dmUser(patch.ownerId, `${who(me, patch.ownerId, "assigned")} *${before.title}* on ${e.name}. ${link(e.slug, taskId)}`);
  } else if (patch.dueDate !== undefined || patch.startDate !== undefined) {
    await logActivity({ engagementId: e.id, actorId: me.id, entityType: "task", entityId: taskId, action: "rescheduled", summary: `rescheduled "${before.title}"` });
  }
  revalidatePath("/", "layout");
}

export async function setAssignees(taskId: string, userIds: string[]) {
  const me = await requireUser();
  const { t, e } = await taskWithEngagement(taskId);
  const current = (await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, taskId))).map((a) => a.userId);
  await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  if (userIds.length) await db.insert(taskAssignees).values(userIds.map((userId) => ({ taskId, userId })));
  for (const uid of userIds.filter((u) => !current.includes(u))) {
    await dmUser(uid, `${who(me, uid, "added")} to *${t.title}* on ${e.name}. ${link(e.slug, taskId)}`);
  }
  revalidatePath("/", "layout");
}

export async function setMyPriority(taskId: string, myPriority: string) {
  const me = await requireUser();
  await db.insert(userTaskPrefs).values({ userId: me.id, taskId, myPriority: myPriority || null })
    .onConflictDoUpdate({ target: [userTaskPrefs.userId, userTaskPrefs.taskId], set: { myPriority: myPriority || null } });
  revalidatePath("/", "layout");
}

export async function addTaskLink(taskId: string, label: string, url: string) {
  const me = await requireUser();
  if (!url.trim()) return;
  await db.insert(taskLinks).values({ taskId, label: label.trim() || url.trim(), url: url.trim(), createdBy: me.id });
  revalidatePath("/", "layout");
}

export async function removeTaskLink(linkId: string) {
  await requireUser();
  await db.delete(taskLinks).where(eq(taskLinks.id, linkId));
  revalidatePath("/", "layout");
}

export async function addComment(taskId: string, body: string) {
  const me = await requireUser();
  if (!body.trim()) return;
  const { t, e } = await taskWithEngagement(taskId);
  // @mentions: "@First Last" or "@first" matched against the team
  const people = await db.select().from(users);
  const lower = body.toLowerCase();
  const mentioned = people.filter((p) => lower.includes(`@${p.name.toLowerCase()}`) || lower.includes(`@${p.name.split(" ")[0]!.toLowerCase()}`));
  await db.insert(comments).values({ engagementId: e.id, taskId, authorId: me.id, body: body.trim(), mentions: mentioned.map((m) => m.id) });
  await logActivity({ engagementId: e.id, actorId: me.id, entityType: "task", entityId: taskId, action: "commented", summary: `commented on "${t.title}"` });
  for (const m of mentioned) {
    await dmUser(m.id, `${m.id === me.id ? "You mentioned yourself" : `${me.name} mentioned you`} on *${t.title}* (${e.name}): "${body.trim().slice(0, 200)}" ${link(e.slug, taskId)}`);
  }
  revalidatePath("/", "layout");
}

export async function deleteTask(taskId: string) {
  const me = await requireUser();
  const { t, e } = await taskWithEngagement(taskId);
  await db.delete(tasks).where(eq(tasks.id, taskId));
  await logActivity({ engagementId: e.id, actorId: me.id, entityType: "task", entityId: null, action: "deleted", summary: `deleted task "${t.title}"` });
  revalidatePath("/", "layout");
}

export async function createPhase(engagementId: string, name: string) {
  await requireUser();
  if (!name.trim()) return;
  const existing = await db.select().from(phases).where(eq(phases.engagementId, engagementId));
  await db.insert(phases).values({ engagementId, name: name.trim(), sortOrder: existing.length });
  revalidatePath("/", "layout");
}

export async function renamePhase(phaseId: string, name: string) {
  await requireUser();
  await db.update(phases).set({ name }).where(eq(phases.id, phaseId));
  revalidatePath("/", "layout");
}

export async function reorderTasks(ids: string[]) {
  await requireUser();
  await Promise.all(ids.map((id, i) => db.update(tasks).set({ sortOrder: i }).where(eq(tasks.id, id))));
  revalidatePath("/", "layout");
}

export async function bulkTaskStatus(ids: string[], status: typeof tasks.$inferInsert.status) {
  await requireUser();
  if (!ids.length) return;
  await db.update(tasks).set({ status, updatedAt: new Date() }).where(and(inArray(tasks.id, ids)));
  revalidatePath("/", "layout");
}
