"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import readXlsxFile from "read-excel-file/node";
import { db } from "@/db";
import { engagementRevs, frameworkSteps } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/session";
import { REV_IDS } from "@/lib/constants";
import { addRevsTo, applyFramework, parseFrameworkSheets, syncServiceLine } from "@/lib/frameworks";
import { logActivity } from "@/lib/activity";
import { todayISO } from "@/lib/format";

/** Add one or more REVs to an engagement and, if asked, the tasks from their frameworks. */
export async function addRevs(engagementId: string, revs: string[], opts: { startDate?: string | null; withTasks: boolean }) {
  const me = await requireUser();
  const r = await addRevsTo(engagementId, revs, opts, me.id);
  revalidatePath("/", "layout");
  return r;
}

/** Add the framework tasks for a REV that's already on the engagement (e.g. the framework was loaded later). */
export async function addRevTasks(engagementId: string, rev: string, startDate: string | null) {
  const me = await requireUser();
  const r = await applyFramework(engagementId, rev, startDate || todayISO(), me.id);
  revalidatePath("/", "layout");
  return r;
}

/** Take a REV off the engagement. Its tasks stay on the plan. */
export async function removeRev(engagementId: string, rev: string) {
  const me = await requireUser();
  await db.delete(engagementRevs).where(and(eq(engagementRevs.engagementId, engagementId), eq(engagementRevs.rev, rev)));
  await syncServiceLine(engagementId);
  await logActivity({ engagementId, actorId: me.id, entityType: "engagement", entityId: engagementId, action: "rev_removed", summary: `removed ${rev} (its tasks stay on the plan)` });
  revalidatePath("/", "layout");
}

export type UploadResult = { ok: true; loaded: { rev: string; milestones: number; tasks: number }[]; skippedTabs: string[] } | { ok: false; error: string };

/** Admins: load frameworks from the spreadsheet (.xlsx). Each REV tab in the file replaces that REV's framework; others stay. */
export async function uploadFrameworks(formData: FormData): Promise<UploadResult> {
  const me = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Pick an .xlsx file." };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Upload the spreadsheet as .xlsx (in Sheets: Download → .xlsx)." };
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = (await readXlsxFile(Buffer.from(await file.arrayBuffer()))) as unknown as { sheet: string; data: unknown[][] }[];
  } catch {
    return { ok: false, error: "Couldn't read that file. Is it an .xlsx spreadsheet?" };
  }
  const parsed = parseFrameworkSheets(sheets);
  const revs = Object.keys(parsed);
  if (!revs.length) return { ok: false, error: `No REV tabs found. Tabs must be named: ${REV_IDS.join(", ")}.` };
  await db.transaction(async (tx) => {
    await tx.delete(frameworkSteps).where(inArray(frameworkSteps.rev, revs));
    for (const rev of revs) {
      await tx.insert(frameworkSteps).values(parsed[rev]!.map((s, i) => ({ ...s, rev, sortOrder: i, uploadedBy: me.id })));
    }
  });
  revalidatePath("/", "layout");
  return {
    ok: true,
    loaded: revs.map((rev) => ({ rev, milestones: parsed[rev]!.filter((s) => s.kind === "milestone").length, tasks: parsed[rev]!.filter((s) => s.kind === "task").length })),
    skippedTabs: sheets.map((s) => s.sheet).filter((n) => !revs.some((r) => r.toLowerCase() === n.trim().toLowerCase())),
  };
}

/** Admins: remove a REV's framework. Engagements that already have its tasks keep them. */
export async function clearFramework(rev: string) {
  await requireAdmin();
  await db.delete(frameworkSteps).where(eq(frameworkSteps.rev, rev));
  revalidatePath("/", "layout");
}
