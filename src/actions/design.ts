"use server";

import { revalidatePath } from "next/cache";
import { and, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { boardOptions, brandClients, tasks } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { notifyTask } from "@/lib/notify";
import { canEditOptions, coreStatus } from "@/lib/design-board";

const HEX = /^#[0-9a-f]{6}$/i;
const cleanHex = (c?: string | null) => {
  const v = (c ?? "").trim();
  const h = v.startsWith("#") ? v : `#${v}`;
  return HEX.test(h) ? h.toUpperCase() : null;
};

async function statusOption(id: string | null | undefined) {
  if (!id) return null;
  return (await db.query.boardOptions.findFirst({ where: eq(boardOptions.id, id) })) ?? null;
}

export async function createDesignTask(engagementId: string, input: {
  title: string; dueDate: string | null; ownerId: string | null; accountOwnerId: string | null; statusOptionId: string | null;
}) {
  const me = await requireUser();
  if (!input.title.trim()) return;
  const s = await statusOption(input.statusOptionId);
  const [t] = await db.insert(tasks).values({
    engagementId, title: input.title.trim(), dueDate: input.dueDate || null, startDate: input.dueDate || null,
    ownerId: input.ownerId || null, accountOwnerId: input.accountOwnerId || null, statusOptionId: s?.id ?? null,
    status: s ? coreStatus(s.label) : "not_started", createdBy: me.id,
  }).returning();
  await logActivity({ engagementId, actorId: me.id, entityType: "task", entityId: t!.id, action: "created", summary: `added task "${t!.title}"` });
  if (t!.ownerId) await notifyTask({ to: t!.ownerId, by: me, kind: "owner", taskId: t!.id, title: t!.title, dueDate: t!.dueDate, engagementId });
  revalidatePath("/", "layout");
}

export async function setTaskStatusOption(taskId: string, optionId: string) {
  const me = await requireUser();
  const s = await statusOption(optionId);
  if (!s) return;
  const [t] = await db.update(tasks).set({ statusOptionId: s.id, ...(await notDone(taskId) ? { status: coreStatus(s.label) } : {}), updatedAt: new Date() })
    .where(eq(tasks.id, taskId)).returning();
  await logActivity({ engagementId: t!.engagementId, actorId: me.id, entityType: "task", entityId: taskId, action: "status_changed", summary: `marked "${t!.title}" ${s.label}` });
  revalidatePath("/", "layout");
}
async function notDone(taskId: string) {
  const t = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  return t?.status !== "done";
}

export async function setAccountOwner(taskId: string, userId: string | null) {
  await requireUser();
  await db.update(tasks).set({ accountOwnerId: userId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  revalidatePath("/", "layout");
}

/** The circle: done moves the task to Completed; undone puts it back with the status it had. */
export async function setTaskDone(taskId: string, done: boolean) {
  const me = await requireUser();
  const t = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!t) return;
  const s = await statusOption(t.statusOptionId);
  await db.update(tasks).set({
    status: done ? "done" : s ? coreStatus(s.label) : "not_started", completedAt: done ? new Date() : null, updatedAt: new Date(),
  }).where(eq(tasks.id, taskId));
  await logActivity({ engagementId: t.engagementId, actorId: me.id, entityType: "task", entityId: taskId, action: "status_changed", summary: done ? `completed "${t.title}"` : `reopened "${t.title}"` });
  revalidatePath("/", "layout");
}

// ---------- Dropdown options (Melissa and admins) ----------
async function guard(engagementId: string) {
  const me = await requireUser();
  if (!(await canEditOptions(me, engagementId))) throw new Error("Only the board owner can edit these options.");
  return me;
}

export async function saveBoardOption(engagementId: string, o: { id?: string; field: "contractor" | "status"; label: string; color: string | null; userId?: string | null }) {
  await guard(engagementId);
  const label = o.label.trim();
  if (!label) return { error: "Add a name." };
  const color = o.color?.trim() ? cleanHex(o.color) : null;
  if (o.color?.trim() && !color) return { error: "Colors are hex codes, like #A4C2F4." };
  if (o.id) {
    await db.update(boardOptions).set({ label, color, userId: o.field === "contractor" ? o.userId ?? null : null })
      .where(and(eq(boardOptions.id, o.id), eq(boardOptions.engagementId, engagementId)));
    if (o.field === "status") {
      // Keep the app-wide status of open tasks in step with a renamed status.
      const open = await db.select().from(tasks).where(eq(tasks.statusOptionId, o.id));
      for (const t of open) if (t.status !== "done") await db.update(tasks).set({ status: coreStatus(label) }).where(eq(tasks.id, t.id));
    }
  } else {
    const [{ m }] = (await db.select({ m: max(boardOptions.sortOrder) }).from(boardOptions)
      .where(and(eq(boardOptions.engagementId, engagementId), eq(boardOptions.field, o.field)))) as [{ m: number | null }];
    await db.insert(boardOptions).values({ engagementId, field: o.field, label, color, userId: o.field === "contractor" ? o.userId ?? null : null, sortOrder: (m ?? -1) + 1 });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Removing a status moves its tasks to the default (first) status. Removing a contractor leaves their tasks unassigned-looking but keeps the person as owner. */
export async function deleteBoardOption(engagementId: string, id: string) {
  await guard(engagementId);
  const o = await db.query.boardOptions.findFirst({ where: and(eq(boardOptions.id, id), eq(boardOptions.engagementId, engagementId)) });
  if (!o) return { ok: true };
  if (o.field === "status") {
    const all = await db.select().from(boardOptions).where(and(eq(boardOptions.engagementId, engagementId), eq(boardOptions.field, "status")));
    const rest = all.filter((s) => s.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
    if (!rest.length) return { error: "Keep at least one status." };
    await db.update(tasks).set({ statusOptionId: rest[0]!.id }).where(eq(tasks.statusOptionId, id));
  }
  await db.delete(boardOptions).where(eq(boardOptions.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Move a status or contractor up or down the list. The first status is the default for new tasks. */
export async function moveBoardOption(engagementId: string, id: string, dir: -1 | 1) {
  await guard(engagementId);
  const o = await db.query.boardOptions.findFirst({ where: eq(boardOptions.id, id) });
  if (!o) return;
  const list = (await db.select().from(boardOptions).where(and(eq(boardOptions.engagementId, engagementId), eq(boardOptions.field, o.field))))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  const i = list.findIndex((x) => x.id === id), j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  for (const [k, x] of list.entries()) await db.update(boardOptions).set({ sortOrder: k }).where(eq(boardOptions.id, x.id));
  revalidatePath("/", "layout");
}

// ---------- Branding Templates ----------
export async function addBrandClient(engagementId: string, name: string) {
  const me = await requireUser();
  if (!name.trim()) return;
  const [c] = await db.insert(brandClients).values({ engagementId, name: name.trim(), updatedBy: me.id }).returning();
  revalidatePath("/", "layout");
  return c!.id;
}

export async function updateBrandClient(id: string, patch: { name?: string; notes?: string | null; isPast?: boolean }) {
  const me = await requireUser();
  const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: me.id };
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim();
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.isPast !== undefined) set.isPast = patch.isPast;
  await db.update(brandClients).set(set).where(eq(brandClients.id, id));
  revalidatePath("/", "layout");
}

export async function deleteBrandClient(engagementId: string, id: string) {
  await guard(engagementId);
  await db.delete(brandClients).where(and(eq(brandClients.id, id), eq(brandClients.engagementId, engagementId)));
  revalidatePath("/", "layout");
}
