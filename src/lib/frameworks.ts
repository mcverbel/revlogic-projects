// REV frameworks: read them from the frameworks spreadsheet, and turn one into phases and tasks on an engagement.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { engagementRevs, engagements, frameworkSteps, phases, tasks } from "@/db/schema";
import { REV_IDS } from "@/lib/constants";
import { logActivity } from "@/lib/activity";
import { todayISO } from "@/lib/format";

export type Step = {
  kind: "milestone" | "task"; number: string | null; title: string; durationWeeks: number;
  repeats: string | null; ownerRole: string | null; clientInput: string | null; output: string | null;
};

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim().replace(/^'/, ""));

/**
 * One tab per REV, named after it (pipelineREV, dealREV, ... SKO, AI Solutions).
 * Columns from the header row that starts with "#": #, Milestone / task, Duration (weeks), Repeats,
 * revlogic owner, Client input, Output / done when. Milestone rows have "M1", "M2"... in the # column.
 * Tabs that aren't REVs (Overview, Sources) are skipped.
 */
export function parseFrameworkSheets(sheets: { sheet: string; data: unknown[][] }[]) {
  const out: Record<string, Step[]> = {};
  for (const s of sheets) {
    const rev = REV_IDS.find((r) => r.toLowerCase() === s.sheet.trim().toLowerCase());
    if (!rev) continue;
    const headerAt = s.data.findIndex((row) => text(row[0]) === "#");
    if (headerAt < 0) continue;
    const head = s.data[headerAt]!.map((h) => text(h).toLowerCase());
    const col = (re: RegExp, fallback: number) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : fallback; };
    const c = {
      no: 0, title: col(/milestone|task/, 1), weeks: col(/duration|week/, 2), repeats: col(/repeat/, 3),
      owner: col(/owner/, 4), client: col(/client/, 5), output: col(/output|done when/, 6),
    };
    const steps: Step[] = [];
    for (const row of s.data.slice(headerAt + 1)) {
      const no = text(row[c.no]);
      let title = text(row[c.title]);
      if (!title) continue;
      const isMilestone = /^M\d+$/i.test(no) || /^MILESTONE\s+\d+/i.test(title);
      if (isMilestone) title = title.replace(/^MILESTONE\s+\d+\s*[:.\-–]\s*/i, "");
      const weeks = Math.max(1, Math.round(Number(text(row[c.weeks])) || 1));
      steps.push({
        kind: isMilestone ? "milestone" : "task", number: no || null, title, durationWeeks: weeks,
        repeats: text(row[c.repeats]) || null, ownerRole: text(row[c.owner]) || null,
        clientInput: text(row[c.client]) || null, output: text(row[c.output]) || null,
      });
    }
    if (steps.length) out[rev] = steps;
  }
  return out;
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Weekend dates move back to Friday. */
function workday(t: number) {
  const d = new Date(t).getUTCDay();
  return d === 6 ? t - DAY : d === 0 ? t - 2 * DAY : t;
}

export type PlannedGroup = { milestone: (Step & { start: string; due: string }) | null; tasks: (Step & { start: string; due: string })[] };

/**
 * Lay a framework out from a start date. Each milestone gets its weeks after the one before it;
 * its tasks start when that window opens and take their own duration, never past the milestone.
 */
export function scheduleFramework(steps: Step[], startISO: string): PlannedGroup[] {
  const groups: PlannedGroup[] = [];
  let pending: Step[] = [];
  let windowStart = Date.parse(`${startISO}T00:00:00Z`);
  const place = (list: Step[], due: number) =>
    list.map((t) => {
      const end = Math.min(windowStart + t.durationWeeks * 7 * DAY - DAY, due);
      return { ...t, start: iso(windowStart), due: iso(Math.max(workday(end), windowStart)) };
    });
  for (const s of steps) {
    if (s.kind === "task") { pending.push(s); continue; }
    const due = windowStart + s.durationWeeks * 7 * DAY - DAY;
    groups.push({ milestone: { ...s, start: iso(windowStart), due: iso(workday(due)) }, tasks: place(pending, due) });
    windowStart = due + DAY;
    pending = [];
  }
  if (pending.length) {
    const longest = Math.max(...pending.map((t) => t.durationWeeks));
    groups.push({ milestone: null, tasks: place(pending, windowStart + longest * 7 * DAY - DAY) });
  }
  return groups;
}

export async function frameworkFor(rev: string): Promise<Step[]> {
  const rows = await db.select().from(frameworkSteps).where(eq(frameworkSteps.rev, rev)).orderBy(asc(frameworkSteps.sortOrder));
  return rows.map((r) => ({
    kind: r.kind as Step["kind"], number: r.number, title: r.title, durationWeeks: r.durationWeeks,
    repeats: r.repeats, ownerRole: r.ownerRole, clientInput: r.clientInput, output: r.output,
  }));
}

/** How many milestones and tasks each REV's framework has (REVs with none are left out). */
export async function frameworkCounts() {
  const rows = await db.select({
    rev: frameworkSteps.rev, kind: frameworkSteps.kind, n: sql<number>`count(*)::int`,
    uploadedAt: sql<Date>`max(${frameworkSteps.uploadedAt})`,
  }).from(frameworkSteps).groupBy(frameworkSteps.rev, frameworkSteps.kind);
  const out: Record<string, { milestones: number; tasks: number; uploadedAt: Date | null }> = {};
  for (const r of rows) {
    const o = (out[r.rev] ??= { milestones: 0, tasks: 0, uploadedAt: null });
    if (r.kind === "milestone") o.milestones = r.n; else o.tasks = r.n;
    if (!o.uploadedAt || (r.uploadedAt && new Date(r.uploadedAt) > o.uploadedAt)) o.uploadedAt = r.uploadedAt ? new Date(r.uploadedAt) : null;
  }
  return out;
}

const KICKOFF_PHASE = "Kickoff";
const shortName = (title: string) => title.split(/[:;]/)[0]!.trim();
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Add a REV's framework to an engagement: one phase per milestone, its tasks, and the milestone itself.
 * The kickoff milestone is shared: its tasks go in one "Kickoff" phase and aren't added twice.
 * Tasks start unassigned and no one is notified.
 */
export async function applyFramework(engagementId: string, rev: string, startISO: string, actorId: string) {
  const steps = await frameworkFor(rev);
  if (!steps.length) return { added: 0, skipped: 0 };
  const plan = scheduleFramework(steps, startISO);
  const [existingTasks, existingPhases] = await Promise.all([
    db.select({ title: tasks.title }).from(tasks).where(eq(tasks.engagementId, engagementId)),
    db.select({ id: phases.id, name: phases.name, sortOrder: phases.sortOrder }).from(phases).where(eq(phases.engagementId, engagementId)),
  ]);
  // Every REV opens with the same kickoff milestone. It goes in one shared "Kickoff" phase, and a kickoff task
  // that's already on the plan isn't added again. Later milestones always get their own tasks.
  const have = new Set(existingTasks.map((t) => norm(t.title)));
  let phaseOrder = existingPhases.reduce((m, p) => Math.max(m, p.sortOrder + 1), 0);
  let added = 0, skipped = 0, n = 0;

  for (const g of plan) {
    n += 1;
    const isKickoff = n === 1 && !!g.milestone;
    const items = [...g.tasks.map((t) => ({ ...t, isMilestone: false })), ...(g.milestone ? [{ ...g.milestone, isMilestone: true }] : [])];
    const fresh = isKickoff ? items.filter((t) => !have.has(norm(t.title))) : items;
    skipped += items.length - fresh.length;
    if (!fresh.length) continue;
    let phaseId: string;
    const shared = isKickoff ? existingPhases.find((p) => p.name === KICKOFF_PHASE) : undefined;
    if (shared) phaseId = shared.id;
    else {
      const name = isKickoff ? KICKOFF_PHASE : g.milestone ? `${rev} · ${n}. ${shortName(g.milestone.title)}` : `${rev} · More tasks`;
      const [phase] = await db.insert(phases).values({ engagementId, name, sortOrder: phaseOrder++ }).returning();
      phaseId = phase!.id;
      if (isKickoff) existingPhases.push({ id: phaseId, name, sortOrder: phase!.sortOrder });
    }
    await db.insert(tasks).values(fresh.map((t, i) => ({
      engagementId, phaseId, title: t.title, isMilestone: t.isMilestone,
      startDate: t.isMilestone ? t.due : t.start, dueDate: t.due, sortOrder: (shared ? 100 : 0) + i, createdBy: actorId,
      description: [
        t.ownerRole && `revlogic owner: ${t.ownerRole}`,
        t.clientInput && `Client input: ${t.clientInput}`,
        t.output && `${t.isMilestone ? "Done when" : "Output"}: ${t.output}`,
        t.repeats && `Repeats: ${t.repeats}`,
        `From the ${rev} framework.`,
      ].filter(Boolean).join("\n"),
    })));
    fresh.forEach((t) => have.add(norm(t.title)));
    added += fresh.length;
  }
  await db.update(engagementRevs).set({ frameworkAppliedAt: new Date() })
    .where(and(eq(engagementRevs.engagementId, engagementId), eq(engagementRevs.rev, rev)));
  await logActivity({ engagementId, actorId, entityType: "engagement", entityId: engagementId, action: "framework_added", summary: `added the ${rev} framework (${added} tasks)` });
  return { added, skipped };
}

/** Keep the old one-line service field in step with the REV list (used where only text fits). */
export async function syncServiceLine(engagementId: string) {
  const rows = await db.select({ rev: engagementRevs.rev }).from(engagementRevs).where(eq(engagementRevs.engagementId, engagementId)).orderBy(asc(engagementRevs.createdAt));
  const order = (r: string) => REV_IDS.indexOf(r);
  const line = rows.map((r) => r.rev).sort((a, b) => order(a) - order(b)).join(", ");
  await db.update(engagements).set({ serviceLine: line || null, updatedAt: new Date() }).where(eq(engagements.id, engagementId));
}

/** Add one or more REVs to an engagement and, if asked, the tasks from their frameworks. Callers check who's asking. */
export async function addRevsTo(engagementId: string, revs: string[], opts: { startDate?: string | null; withTasks: boolean }, actorId: string) {
  const me = { id: actorId };
  const picked = [...new Set(revs.filter((r) => REV_IDS.includes(r)))];
  if (!picked.length) return { added: 0 };
  const already = await db.select({ rev: engagementRevs.rev }).from(engagementRevs)
    .where(and(eq(engagementRevs.engagementId, engagementId), inArray(engagementRevs.rev, picked)));
  const fresh = picked.filter((r) => !already.some((a) => a.rev === r));
  if (fresh.length) await db.insert(engagementRevs).values(fresh.map((rev) => ({ engagementId, rev, addedBy: me.id }))).onConflictDoNothing();
  let added = 0;
  if (opts.withTasks) {
    for (const rev of fresh) added += (await applyFramework(engagementId, rev, opts.startDate || todayISO(), me.id)).added;
  }
  if (fresh.length) {
    await syncServiceLine(engagementId);
    await logActivity({ engagementId, actorId: me.id, entityType: "engagement", entityId: engagementId, action: "rev_added", summary: `added ${fresh.join(", ")}` });
  }
  return { added };
}

