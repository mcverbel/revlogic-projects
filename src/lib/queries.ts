import { db } from "@/db";
import {
  engagements, clients, engagementMembers, users, tasks, taskAssignees, userTaskPrefs, suggestions,
  activityLog, comments, taskLinks, documents, clientContacts, phases, engagementSources,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

export type UserLite = { id: string; name: string; email: string; avatarUrl: string | null };

export async function allUsers(): Promise<(typeof users.$inferSelect)[]> {
  return db.select().from(users).orderBy(asc(users.name));
}

export async function sidebarEngagements(userId: string) {
  const rows = await db
    .select({
      id: engagements.id, slug: engagements.slug, name: engagements.name, stage: engagements.journeyStage,
      client: clients.name, category: engagements.category,
      mine: sql<boolean>`exists(select 1 from ${engagementMembers} m where m.engagement_id = ${engagements.id} and m.user_id = ${userId})`,
    })
    .from(engagements)
    .innerJoin(clients, eq(clients.id, engagements.clientId))
    .where(isNull(engagements.archivedAt))
    .orderBy(asc(clients.name));
  return rows;
}

export async function listEngagements() {
  const rows = await db
    .select({
      e: engagements, client: clients,
      openTasks: sql<number>`(select count(*)::int from ${tasks} t where t.engagement_id = ${engagements.id} and t.status <> 'done')`,
      pending: sql<number>`(select count(*)::int from ${suggestions} s where s.engagement_id = ${engagements.id} and s.status = 'pending')`,
    })
    .from(engagements)
    .innerJoin(clients, eq(clients.id, engagements.clientId))
    .where(isNull(engagements.archivedAt))
    .orderBy(desc(engagements.updatedAt));
  const leads = await db.select().from(users);
  return rows.map((r) => ({ ...r, lead: leads.find((u) => u.id === r.e.leadUserId) ?? null }));
}

export async function getEngagement(slug: string, meId: string) {
  const e = await db.query.engagements.findFirst({ where: eq(engagements.slug, slug) });
  if (!e) return null;
  const [client, members, contacts, docs, phaseRows, taskRows, sugg, activity, sources, people] = await Promise.all([
    db.query.clients.findFirst({ where: eq(clients.id, e.clientId) }),
    db.select({ m: engagementMembers, u: users }).from(engagementMembers).innerJoin(users, eq(users.id, engagementMembers.userId)).where(eq(engagementMembers.engagementId, e.id)),
    db.select().from(clientContacts).where(eq(clientContacts.engagementId, e.id)).orderBy(asc(clientContacts.sortOrder), asc(clientContacts.createdAt)),
    db.select().from(documents).where(eq(documents.engagementId, e.id)).orderBy(desc(documents.updatedAt)),
    db.select().from(phases).where(eq(phases.engagementId, e.id)).orderBy(asc(phases.sortOrder)),
    db.select().from(tasks).where(eq(tasks.engagementId, e.id)).orderBy(asc(tasks.sortOrder), asc(tasks.dueDate), asc(tasks.createdAt)),
    db.select().from(suggestions).where(eq(suggestions.engagementId, e.id)).orderBy(desc(suggestions.createdAt)),
    db.select().from(activityLog).where(eq(activityLog.engagementId, e.id)).orderBy(desc(activityLog.createdAt)).limit(15),
    db.select().from(engagementSources).where(eq(engagementSources.engagementId, e.id)),
    allUsers(),
  ]);
  const taskIds = taskRows.map((t) => t.id);
  const [assignees, prefs, links, commentRows] = taskIds.length
    ? await Promise.all([
        db.select().from(taskAssignees).where(inArray(taskAssignees.taskId, taskIds)),
        db.select().from(userTaskPrefs).where(and(eq(userTaskPrefs.userId, meId), inArray(userTaskPrefs.taskId, taskIds))),
        db.select().from(taskLinks).where(inArray(taskLinks.taskId, taskIds)),
        db.select().from(comments).where(inArray(comments.taskId, taskIds)).orderBy(asc(comments.createdAt)),
      ])
    : [[], [], [], []];
  const fullTasks = taskRows.map((t) => ({
    ...t,
    assigneeIds: assignees.filter((a) => a.taskId === t.id).map((a) => a.userId),
    myPriority: prefs.find((p) => p.taskId === t.id)?.myPriority ?? "",
    links: links.filter((l) => l.taskId === t.id),
    comments: commentRows.filter((c) => c.taskId === t.id),
  }));
  return { e, client: client!, members, contacts, docs, phases: phaseRows, tasks: fullTasks, suggestions: sugg, activity, sources, people };
}

export type EngagementData = NonNullable<Awaited<ReturnType<typeof getEngagement>>>;
export type FullTask = EngagementData["tasks"][number];

export async function myWork(userId: string) {
  const assignedIds = db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, userId));
  const rows = await db
    .select({ t: tasks, e: engagements, client: clients, myPriority: userTaskPrefs.myPriority })
    .from(tasks)
    .innerJoin(engagements, eq(engagements.id, tasks.engagementId))
    .innerJoin(clients, eq(clients.id, engagements.clientId))
    .leftJoin(userTaskPrefs, and(eq(userTaskPrefs.taskId, tasks.id), eq(userTaskPrefs.userId, userId)))
    .where(and(or(eq(tasks.ownerId, userId), inArray(tasks.id, assignedIds)), isNull(engagements.archivedAt)));
  const rank: Record<string, number> = { top: 0, high: 1, medium: 2, low: 3 };
  return rows.sort((a, b) => {
    const ra = rank[a.myPriority ?? ""] ?? 4, rb = rank[b.myPriority ?? ""] ?? 4;
    if (ra !== rb) return ra - rb;
    return (a.t.dueDate ?? "9999").localeCompare(b.t.dueDate ?? "9999");
  });
}

export async function mySuggestionCount(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(suggestions)
    .where(and(eq(suggestions.status, "pending"), sql`${userId} = any(${suggestions.ownerIds})`));
  return r?.n ?? 0;
}
