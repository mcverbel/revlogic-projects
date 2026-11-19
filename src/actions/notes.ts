"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectNoteReplies, projectNoteTasks, projectNotes, tasks } from "@/db/schema";
import { requireUser, type Me } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { findMentions } from "@/lib/mentions";
import { notifyNote, NOTE_KINDS, WAITING_ON } from "@/lib/notes";
import { notifyTask } from "@/lib/notify";

type NoteInput = {
  kind: string; title: string; body?: string | null; visibility: "team" | "private";
  waitingOn?: string | null; ownerId?: string | null; neededBy?: string | null; taskIds?: string[];
  meetingDate?: string | null; attendees?: string | null; recordingUrl?: string | null; mentionIds?: string[];
};

/** A private note exists only for its author: anyone else gets "not found". */
async function noteFor(me: Me, noteId: string) {
  const n = await db.query.projectNotes.findFirst({ where: eq(projectNotes.id, noteId) });
  if (!n || (n.visibility === "private" && n.authorId !== me.id)) throw new Error("Note not found");
  return n;
}
/** "a blocker", "a dependency", "meeting notes", "a note" */
const aLabel = (kind: string) => (kind === "meeting" ? "meeting notes" : `a ${NOTE_KINDS.find((k) => k.id === kind)?.label.toLowerCase() ?? "note"}`);
const canEdit = (me: Me, n: { authorId: string }) => n.authorId === me.id || me.role === "admin";

function clean(input: NoteInput) {
  const kind = NOTE_KINDS.some((k) => k.id === input.kind) ? input.kind : "note";
  const issue = kind === "blocker" || kind === "dependency";
  return {
    kind, title: input.title.trim(), body: input.body?.trim() || null,
    visibility: input.visibility === "private" ? "private" : "team",
    waitingOn: issue && WAITING_ON.some((w) => w.id === input.waitingOn) ? input.waitingOn! : null,
    ownerId: issue ? input.ownerId || null : null,
    neededBy: issue ? input.neededBy || null : null,
    meetingDate: kind === "meeting" ? input.meetingDate || null : null,
    attendees: kind === "meeting" ? input.attendees?.trim() || null : null,
    recordingUrl: kind === "meeting" ? input.recordingUrl?.trim() || null : null,
  };
}

async function setHeldTasks(noteId: string, engagementId: string, taskIds: string[]) {
  await db.delete(projectNoteTasks).where(eq(projectNoteTasks.noteId, noteId));
  const valid = taskIds.length
    ? (await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.engagementId, engagementId))).map((t) => t.id).filter((id) => taskIds.includes(id))
    : [];
  if (valid.length) await db.insert(projectNoteTasks).values(valid.map((taskId) => ({ noteId, taskId })));
}

export async function createNote(engagementId: string, input: NoteInput) {
  const me = await requireUser();
  const v = clean(input);
  if (!v.title) return { error: "Add a title." };
  const mentioned = v.visibility === "team" ? await findMentions(`${v.body ?? ""} ${v.attendees ?? ""}`, input.mentionIds ?? []) : [];
  const [n] = await db.insert(projectNotes).values({ ...v, engagementId, authorId: me.id, mentions: mentioned.map((m) => m.id) }).returning();
  if (v.kind === "blocker" || v.kind === "dependency") await setHeldTasks(n!.id, engagementId, input.taskIds ?? []);
  if (v.visibility === "team") {
    await logActivity({ engagementId, actorId: me.id, entityType: "note", entityId: n!.id, action: "created", summary: `added ${aLabel(v.kind)}: "${v.title}"` });
    if (v.ownerId) await notifyNote({ to: v.ownerId, by: me, kind: "owner", note: n!, text: v.body });
    for (const m of mentioned) if (m.id !== v.ownerId) await notifyNote({ to: m.id, by: me, kind: "mention", note: n!, text: v.body });
  }
  revalidatePath("/", "layout");
  return { ok: true, id: n!.id };
}

export async function updateNote(noteId: string, input: NoteInput) {
  const me = await requireUser();
  const before = await noteFor(me, noteId);
  if (!canEdit(me, before)) throw new Error("Only the author can edit this note.");
  const v = clean(input);
  if (!v.title) return { error: "Add a title." };
  // Only the author can make a note private (an admin editing someone's shared note keeps it shared).
  if (before.authorId !== me.id) v.visibility = before.visibility;
  const mentioned = v.visibility === "team" ? await findMentions(`${v.body ?? ""} ${v.attendees ?? ""}`, input.mentionIds ?? []) : [];
  const [n] = await db.update(projectNotes).set({ ...v, mentions: mentioned.map((m) => m.id), updatedAt: new Date() }).where(eq(projectNotes.id, noteId)).returning();
  if (v.kind === "blocker" || v.kind === "dependency") await setHeldTasks(noteId, n!.engagementId, input.taskIds ?? []);
  else await setHeldTasks(noteId, n!.engagementId, []);
  if (v.visibility === "team") {
    const wasShared = before.visibility === "team";
    if (v.ownerId && (v.ownerId !== before.ownerId || !wasShared)) await notifyNote({ to: v.ownerId, by: me, kind: "owner", note: n!, text: v.body });
    for (const m of mentioned) if (m.id !== v.ownerId && (!wasShared || !before.mentions.includes(m.id))) await notifyNote({ to: m.id, by: me, kind: "mention", note: n!, text: v.body });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Share a private note with the team (or make your own note private again). */
export async function setNoteVisibility(noteId: string, visibility: "team" | "private") {
  const me = await requireUser();
  const n = await noteFor(me, noteId);
  if (n.authorId !== me.id) throw new Error("Only the author can change who sees this note.");
  const [after] = await db.update(projectNotes).set({ visibility, updatedAt: new Date() }).where(eq(projectNotes.id, noteId)).returning();
  if (visibility === "team" && n.visibility === "private") {
    await logActivity({ engagementId: n.engagementId, actorId: me.id, entityType: "note", entityId: n.id, action: "shared", summary: `shared ${aLabel(n.kind)}: "${n.title}"` });
    if (n.ownerId) await notifyNote({ to: n.ownerId, by: me, kind: "owner", note: after!, text: n.body });
    for (const id of n.mentions) if (id !== n.ownerId) await notifyNote({ to: id, by: me, kind: "mention", note: after!, text: n.body });
  }
  revalidatePath("/", "layout");
}

/** Anyone who can see a blocker or dependency can resolve or reopen it. */
export async function setNoteStatus(noteId: string, status: "open" | "resolved") {
  const me = await requireUser();
  const n = await noteFor(me, noteId);
  await db.update(projectNotes).set({ status, resolvedAt: status === "resolved" ? new Date() : null, resolvedBy: status === "resolved" ? me.id : null, updatedAt: new Date() })
    .where(eq(projectNotes.id, noteId));
  if (n.visibility === "team") {
    await logActivity({ engagementId: n.engagementId, actorId: me.id, entityType: "note", entityId: n.id, action: status, summary: `${status === "resolved" ? "resolved" : "reopened"} "${n.title}"` });
  }
  revalidatePath("/", "layout");
}

export async function deleteNote(noteId: string) {
  const me = await requireUser();
  const n = await noteFor(me, noteId);
  if (!canEdit(me, n)) throw new Error("Only the author can delete this note.");
  await db.delete(projectNotes).where(eq(projectNotes.id, noteId));
  revalidatePath("/", "layout");
}

export async function addNoteReply(noteId: string, body: string, mentionIds: string[] = []) {
  const me = await requireUser();
  if (!body.trim()) return;
  const n = await noteFor(me, noteId);
  const mentioned = n.visibility === "team" ? await findMentions(body, mentionIds) : [];
  await db.insert(projectNoteReplies).values({ noteId, authorId: me.id, body: body.trim(), mentions: mentioned.map((m) => m.id) });
  if (n.visibility === "team") {
    const notified = new Set<string>();
    for (const m of mentioned) { await notifyNote({ to: m.id, by: me, kind: "mention", note: n, text: body }); notified.add(m.id); }
    if (!notified.has(n.authorId)) await notifyNote({ to: n.authorId, by: me, kind: "reply", note: n, text: body });
  }
  revalidatePath("/", "layout");
}

export async function updateNoteReply(replyId: string, body: string, mentionIds: string[] = []) {
  const me = await requireUser();
  if (!body.trim()) return;
  const r = await db.query.projectNoteReplies.findFirst({ where: eq(projectNoteReplies.id, replyId) });
  if (!r) return;
  const n = await noteFor(me, r.noteId);
  if (r.authorId !== me.id && me.role !== "admin") throw new Error("You can only edit your own replies.");
  const mentioned = n.visibility === "team" ? await findMentions(body, mentionIds) : [];
  await db.update(projectNoteReplies).set({ body: body.trim(), mentions: mentioned.map((m) => m.id) }).where(eq(projectNoteReplies.id, replyId));
  for (const m of mentioned.filter((m) => !r.mentions.includes(m.id))) await notifyNote({ to: m.id, by: me, kind: "mention", note: n, text: body });
  revalidatePath("/", "layout");
}

export async function deleteNoteReply(replyId: string) {
  const me = await requireUser();
  const r = await db.query.projectNoteReplies.findFirst({ where: eq(projectNoteReplies.id, replyId) });
  if (!r) return;
  await noteFor(me, r.noteId);
  if (r.authorId !== me.id && me.role !== "admin") throw new Error("You can only delete your own replies.");
  await db.delete(projectNoteReplies).where(and(eq(projectNoteReplies.id, replyId)));
  revalidatePath("/", "layout");
}

/** "Turn next steps into tasks": create the checked drafts on the Plan. Owners get the usual Slack DM. */
export async function noteStepsToTasks(noteId: string, drafts: { title: string; ownerId: string | null; dueDate: string | null }[]) {
  const me = await requireUser();
  const n = await noteFor(me, noteId);
  let made = 0;
  for (const d of drafts) {
    if (!d.title.trim()) continue;
    const [t] = await db.insert(tasks).values({
      engagementId: n.engagementId, title: d.title.trim(), ownerId: d.ownerId || null,
      dueDate: d.dueDate || null, startDate: d.dueDate || null, createdBy: me.id,
      notes: `From meeting notes: ${n.title}${n.meetingDate ? ` (${n.meetingDate})` : ""}`,
    }).returning();
    made++;
    if (t!.ownerId) await notifyTask({ to: t!.ownerId, by: me, kind: "owner", taskId: t!.id, title: t!.title, dueDate: t!.dueDate, engagementId: n.engagementId });
  }
  if (made) await logActivity({ engagementId: n.engagementId, actorId: me.id, entityType: "note", entityId: n.id, action: "tasks_created", summary: `added ${made} task${made === 1 ? "" : "s"} from "${n.title}"` });
  revalidatePath("/", "layout");
  return { made };
}
