import { NextResponse } from "next/server";
import { and, eq, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/db";
import { tasks, engagements, taskAssignees } from "@/db/schema";
import { cronAuthorized } from "@/lib/cron";
import { dmUser } from "@/lib/slack";
import { fmtDate, todayISO } from "@/lib/format";
import { appUrl } from "@/lib/app-url";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({ t: tasks, e: engagements })
    .from(tasks)
    .innerJoin(engagements, eq(engagements.id, tasks.engagementId))
    .where(and(ne(tasks.status, "done"), lte(tasks.dueDate, tomorrow), isNull(engagements.archivedAt)));
  const assignees = await db.select().from(taskAssignees);
  const byUser = new Map<string, string[]>();
  for (const { t, e } of rows) {
    const people = [t.ownerId, ...assignees.filter((a) => a.taskId === t.id).map((a) => a.userId)].filter(Boolean) as string[];
    const line = `• ${t.dueDate! < todayISO() ? "*Overdue*" : `Due ${fmtDate(t.dueDate)}`}: ${t.title} (${e.name}) <${appUrl()}/e/${e.slug}/plan?task=${t.id}|Open>`;
    for (const p of new Set(people)) byUser.set(p, [...(byUser.get(p) ?? []), line]);
  }
  for (const [userId, lines] of byUser) await dmUser(userId, `Your tasks due soon:\n${lines.join("\n")}`);
  return NextResponse.json({ notified: byUser.size, tasks: rows.length });
}
