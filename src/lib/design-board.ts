// The Graphic Design board: its own tabs (Tasks, Completed, Branding Templates), dropdowns Melissa edits,
// and a client list with notes. Everything here applies to that one board only.
import { and, asc, eq, ilike, inArray, isNull, ne, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { boardOptions, brandClients, clients, engagements, tasks, users } from "@/db/schema";
import { CREATIVE_BOARDS } from "@/lib/constants";
import type { Me } from "@/lib/session";

export const DESIGN_BOARD_SLUG = CREATIVE_BOARDS.find((b) => b.bucket === "graphic-design")!.slug;
export const isDesignBoard = (slug: string) => slug === DESIGN_BOARD_SLUG;

export type BoardOption = typeof boardOptions.$inferSelect;

/** Starting statuses, in Melissa's colors. The first one is the default for new tasks. */
const DEFAULT_STATUSES = [
  { label: "Not started", color: "#C9CED6", maps: "not_started" },
  { label: "In progress", color: "#A4C2F4", maps: "in_progress" },
  { label: "In review", color: "#8FD8D2", maps: "in_review" },
  { label: "Blocked", color: "#F79CBF", maps: "blocked" },
] as const;
/** Starting contractors (matched to team members by first name, only when exactly one matches). */
const DEFAULT_CONTRACTORS = [
  { first: "Gracy", color: "#DFC2EE" },
  { first: "Charlotte", color: "#E3F542" },
  { first: "Sam", color: "#FFD966" },
];

/** Map a status label to the app-wide status, so My Work, reminders and "blocked" counts keep working. */
export function coreStatus(label: string): "not_started" | "in_progress" | "in_review" | "blocked" {
  const l = label.toLowerCase().replace(/[-_]/g, " ");
  if (/progress|working|doing/.test(l)) return "in_progress";
  if (/review|feedback|approval/.test(l)) return "in_review";
  if (/block|hold|waiting|stuck/.test(l)) return "blocked";
  return "not_started";
}

/** First visit after the update: statuses, contractors, client list, Melissa as board owner, and existing tasks filled in. */
export async function ensureDesignBoard(engagementId: string) {
  const seeded = await db.select({ id: boardOptions.id }).from(boardOptions)
    .where(and(eq(boardOptions.engagementId, engagementId), eq(boardOptions.field, "status"))).limit(1);
  if (seeded.length) return;
  await db.transaction(async (tx) => {
  // One request seeds; any others running at the same moment wait here, then see it done.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${engagementId}))`);
  const has = await tx.select({ id: boardOptions.id }).from(boardOptions)
    .where(and(eq(boardOptions.engagementId, engagementId), eq(boardOptions.field, "status"))).limit(1);
  if (has.length) return;

  const statuses = await tx.insert(boardOptions).values(DEFAULT_STATUSES.map((s, i) => ({
    engagementId, field: "status", label: s.label, color: s.color, sortOrder: i,
  }))).returning();

  const team = await tx.select({ id: users.id, name: users.name }).from(users);
  const contractors = DEFAULT_CONTRACTORS.map((c) => ({ ...c, matches: team.filter((u) => u.name.split(/\s+/)[0]!.toLowerCase() === c.first.toLowerCase()) }))
    .filter((c) => c.matches.length === 1);
  if (contractors.length) {
    await tx.insert(boardOptions).values(contractors.map((c, i) => ({
      engagementId, field: "contractor", label: c.first, color: c.color, userId: c.matches[0]!.id, sortOrder: i,
    })));
  }

  const melissa = await tx.select({ id: users.id }).from(users).where(ilike(users.name, "Melissa Griffore%"));
  if (melissa.length === 1) await tx.update(engagements).set({ leadUserId: melissa[0]!.id }).where(eq(engagements.id, engagementId));

  // Existing tasks: status from the old status, account owner = whoever asked for it.
  const rows = await tx.select().from(tasks).where(eq(tasks.engagementId, engagementId));
  for (const t of rows) {
    const s = statuses[Math.max(0, DEFAULT_STATUSES.findIndex((d) => d.maps === t.status))]!;
    await tx.update(tasks).set({ statusOptionId: s.id, accountOwnerId: t.accountOwnerId ?? t.createdBy }).where(eq(tasks.id, t.id));
  }

  // Client list to start from: every client with an engagement or partner project (not revlogic itself).
  const named = await tx.selectDistinct({ name: clients.name }).from(clients)
    .innerJoin(engagements, eq(engagements.clientId, clients.id))
    .where(and(ne(clients.name, "revlogic"), inArray(engagements.category, ["engagement", "partner"]), isNull(engagements.archivedAt)));
  if (named.length) await tx.insert(brandClients).values(named.map((c) => ({ engagementId, name: c.name })));
  });
}

export const loadDesignBoard = cache(async (engagementId: string) => {
  await ensureDesignBoard(engagementId);
  const [options, brand] = await Promise.all([
    db.select().from(boardOptions).where(eq(boardOptions.engagementId, engagementId)).orderBy(asc(boardOptions.sortOrder), asc(boardOptions.createdAt)),
    db.select().from(brandClients).where(eq(brandClients.engagementId, engagementId)).orderBy(asc(brandClients.name)),
  ]);
  return {
    contractors: options.filter((o) => o.field === "contractor"),
    statuses: options.filter((o) => o.field === "status"),
    brand,
  };
});

/** Melissa (the board owner) and admins edit the dropdown options. */
export async function canEditOptions(me: Me, engagementId: string) {
  if (me.role === "admin") return true;
  const e = await db.query.engagements.findFirst({ where: eq(engagements.id, engagementId) });
  return e?.leadUserId === me.id;
}
