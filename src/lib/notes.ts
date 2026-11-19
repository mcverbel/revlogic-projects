// Notes tab: blockers, dependencies, meeting notes and notes on an engagement or partner project.
// Private notes are only ever loaded for their author (admins included: they don't see them).
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, engagements, projectNoteReplies, projectNoteTasks, projectNotes, users } from "@/db/schema";
import { dmUser } from "@/lib/slack";
import { appUrl } from "@/lib/app-url";
import { fmtDate } from "@/lib/format";
import { toSlack } from "@/lib/rich";

import { NOTE_KINDS } from "@/lib/notes-shared";
export { NOTE_KINDS, WAITING_ON, nextSteps, type NoteKind } from "@/lib/notes-shared";

/** Who can see a note: team notes, plus your own private ones. */
export const visibleTo = (meId: string) => or(eq(projectNotes.visibility, "team"), eq(projectNotes.authorId, meId));

export async function loadNotes(engagementId: string, meId: string) {
  const notes = await db.select().from(projectNotes)
    .where(and(eq(projectNotes.engagementId, engagementId), visibleTo(meId)))
    .orderBy(desc(projectNotes.createdAt));
  const ids = notes.map((n) => n.id);
  const [replies, held] = ids.length
    ? await Promise.all([
        db.select().from(projectNoteReplies).where(inArray(projectNoteReplies.noteId, ids)).orderBy(asc(projectNoteReplies.createdAt)),
        db.select().from(projectNoteTasks).where(inArray(projectNoteTasks.noteId, ids)),
      ])
    : [[], []];
  return notes.map((n) => ({
    ...n,
    replies: replies.filter((r) => r.noteId === n.id),
    taskIds: held.filter((h) => h.noteId === n.id).map((h) => h.taskId),
  }));
}
export type FullNote = Awaited<ReturnType<typeof loadNotes>>[number];

/** How many notes the viewer can see (for the tab). */
export async function countNotes(engagementId: string, meId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(projectNotes).where(and(eq(projectNotes.engagementId, engagementId), visibleTo(meId)));
  return r?.n ?? 0;
}

/** Open blockers and dependencies the viewer can see (for the Overview card and the tab count). */
export async function openIssues(engagementId: string, meId: string) {
  return db.select().from(projectNotes)
    .where(and(eq(projectNotes.engagementId, engagementId), visibleTo(meId), inArray(projectNotes.kind, ["blocker", "dependency"]), eq(projectNotes.status, "open")))
    .orderBy(asc(projectNotes.neededBy), desc(projectNotes.createdAt));
}

/** Slack DM about a team note: you own it, you were @tagged, or someone replied. Never sent for private notes. */
export async function notifyNote(opts: {
  to: string; by: { id: string; name: string }; kind: "owner" | "mention" | "reply";
  note: typeof projectNotes.$inferSelect; text?: string | null;
}) {
  if (opts.note.visibility !== "team" || opts.to === opts.by.id) return;
  const [person, e] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, opts.to) }),
    db.query.engagements.findFirst({ where: eq(engagements.id, opts.note.engagementId) }),
  ]);
  if (!person || !e) return;
  const client = await db.query.clients.findFirst({ where: eq(clients.id, e.clientId) });
  const project = client && client.name !== "revlogic" ? `${client.name} · ${e.name}` : e.name;
  const label = opts.note.kind === "meeting" ? "meeting note" : NOTE_KINDS.find((k) => k.id === opts.note.kind)?.label.toLowerCase() ?? "note";
  const first = person.name.split(" ")[0];
  const intro = opts.kind === "owner" ? `Hi ${first}, *${opts.by.name}* made you the owner of a ${label}:`
    : opts.kind === "mention" ? `Hi ${first}, *${opts.by.name}* mentioned you in a ${label}:`
    : `Hi ${first}, *${opts.by.name}* replied to a ${label}:`;
  const details = [opts.note.neededBy ? `:calendar: Needed by ${fmtDate(opts.note.neededBy)}` : null, `:file_folder: ${project}`].filter(Boolean).join("   ·   ");
  const url = `${appUrl()}/e/${e.slug}/notes?note=${opts.note.id}`;
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: intro } },
    { type: "section", text: { type: "mrkdwn", text: `*${opts.note.title}*\n${details}` } },
  ];
  if (opts.text?.trim()) blocks.push({ type: "section", text: { type: "mrkdwn", text: `> ${toSlack(opts.text.trim()).slice(0, 400).replace(/\n/g, "\n> ")}` } });
  blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open note" }, url, style: "primary", action_id: "open_note" }] });
  await dmUser(opts.to, `${intro.replace(/\*/g, "")} ${opts.note.title} - ${project}`, blocks);
}

