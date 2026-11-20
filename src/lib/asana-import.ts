// One-time Asana migration for the Graphic Design board. Melissa's own Claude reads her Asana
// (with her Asana connector) and sends completed tasks here through the tracker connector's
// import_asana_completed_tasks tool. The app never sees an Asana credential.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { boardOptions, comments, engagements, processedItems, tasks, users } from "@/db/schema";
import { DESIGN_BOARD_SLUG, ensureDesignBoard } from "@/lib/design-board";
import { logActivity } from "@/lib/activity";

/** Tokens made by the migration button carry this label and expire after 24 hours. */
export const TEMP_TOKEN_LABEL = "Asana migration (expires in 24 hours)";
export const TEMP_TOKEN_HOURS = 24;

type AsanaPerson = { name?: string; email?: string } | null | undefined;
export type AsanaTaskIn = {
  asana_id: string; title: string; completed_at: string; due_date?: string | null;
  assignee?: AsanaPerson; requester?: AsanaPerson; notes?: string | null; url?: string | null;
  project?: string | null; client?: string | null;
  attachments?: { name?: string; url?: string }[]; comments?: { author?: AsanaPerson; at?: string; text?: string }[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const https = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v.slice(0, 1000) : null);

export async function importAsanaTasks(userId: string, input: { tasks?: unknown; dry_run?: unknown }) {
  const me = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const board = await db.query.engagements.findFirst({ where: eq(engagements.slug, DESIGN_BOARD_SLUG) });
  if (!me || !board) throw new Error("Graphic Design board not found");
  if (me.role !== "admin" && board.leadUserId !== me.id) throw new Error("Only the Graphic Design board owner or an admin can import from Asana.");
  await ensureDesignBoard(board.id);

  const list = (Array.isArray(input.tasks) ? input.tasks : []) as AsanaTaskIn[];
  if (list.length > 50) throw new Error("Send at most 50 tasks per call.");
  const dryRun = input.dry_run !== false;

  const team = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  const unmatched = new Set<string>();
  const find = (p: AsanaPerson) => {
    if (!p || (!p.email && !p.name)) return null;
    const hit = (p.email && team.find((u) => u.email.toLowerCase() === p.email!.toLowerCase()))
      || (p.name && team.filter((u) => u.name.toLowerCase() === p.name!.trim().toLowerCase()).length === 1 && team.find((u) => u.name.toLowerCase() === p.name!.trim().toLowerCase()));
    if (!hit) unmatched.add(p.name || p.email!);
    return hit || null;
  };

  const ids = list.map((t) => str(t?.asana_id, 100)).filter(Boolean);
  const done = ids.length
    ? (await db.select({ id: processedItems.externalId }).from(processedItems)
        .where(and(eq(processedItems.provider, "asana"), eq(processedItems.engagementId, board.id), inArray(processedItems.externalId, ids)))).map((r) => r.id)
    : [];
  const [firstStatus] = await db.select().from(boardOptions).where(and(eq(boardOptions.engagementId, board.id), eq(boardOptions.field, "status"))).orderBy(asc(boardOptions.sortOrder)).limit(1);

  let imported = 0, already = 0;
  const invalid: string[] = [];
  for (const t of list) {
    const asanaId = str(t?.asana_id, 100);
    const title = str(t?.title, 500);
    if (!asanaId || !title || !isDate(t.completed_at)) { invalid.push(title || asanaId || "(no title)"); continue; }
    if (done.includes(asanaId)) { already++; continue; }
    const owner = find(t.assignee);
    const requester = find(t.requester);
    const authors = (t.comments ?? []).map((c) => find(c?.author));
    if (dryRun) { imported++; continue; }

    // Links go in the notes as [text](url), so they show in the task drawer like any other note link.
    const label = (v: string) => v.replace(/[[\]\n]/g, " ").trim();
    const header = [t.project && `Asana project: ${str(t.project, 200)}`, t.client && `Client: ${str(t.client, 200)}`, https(t.url) && `[Open in Asana](${https(t.url)})`].filter(Boolean).join(" · ");
    const files = (t.attachments ?? []).filter((a) => https(a?.url)).slice(0, 30).map((a) => `- [${label(str(a.name, 200)) || "Attachment"}](${https(a.url)})`);
    const notes = [header, str(t.notes, 20000), files.length ? `Attachments:\n${files.join("\n")}` : ""].filter(Boolean).join("\n\n") || null;
    const due = typeof t.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null;
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(tasks).values({
        engagementId: board.id, title, notes, ownerId: owner?.id ?? null, accountOwnerId: requester?.id ?? null,
        status: "done", completedAt: new Date(t.completed_at), dueDate: due, startDate: due,
        statusOptionId: firstStatus?.id ?? null, createdBy: me.id,
      }).returning();
      const cs = (t.comments ?? []).slice(0, 100).map((c, i) => ({ c, author: authors[i] })).filter(({ c }) => str(c?.text, 10) !== "");
      if (cs.length) {
        await tx.insert(comments).values(cs.map(({ c, author }) => ({
          engagementId: board.id, taskId: row!.id, authorId: author?.id ?? me.id,
          // Someone not in the app keeps their name on the comment; it's posted under the importer.
          body: author ? str(c.text, 10000) : `${str(c?.author?.name, 120) || str(c?.author?.email, 200) || "Someone"} (in Asana): ${str(c.text, 10000)}`,
          ...(isDate(c.at) ? { createdAt: new Date(c.at) } : {}),
        })));
      }
      await tx.insert(processedItems).values({ provider: "asana", externalId: asanaId, engagementId: board.id }).onConflictDoNothing();
    });
    imported++;
  }
  if (!dryRun && imported) {
    await logActivity({ engagementId: board.id, actorId: me.id, entityType: "task", action: "imported", summary: `imported ${imported} completed task${imported === 1 ? "" : "s"} from Asana` });
  }
  return {
    dry_run: dryRun,
    [dryRun ? "would_import" : "imported"]: imported,
    already_imported: already,
    skipped_missing_title_or_completed_at: invalid,
    people_not_in_the_app: [...unmatched],
  };
}

/** How many tasks have come over from Asana so far (shown next to the migration button). */
export async function asanaImportedCount(engagementId: string) {
  const rows = await db.select({ id: processedItems.externalId }).from(processedItems)
    .where(and(eq(processedItems.provider, "asana"), eq(processedItems.engagementId, engagementId)));
  return rows.length;
}
