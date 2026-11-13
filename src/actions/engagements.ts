"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, engagements, engagementMembers, engagementSources } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { slugify } from "@/lib/format";
import { journeyLabel } from "@/lib/constants";
import { dmUser, postToChannel } from "@/lib/slack";
import { appUrl } from "@/lib/app-url";

const CreateSchema = z.object({
  clientName: z.string().min(1),
  clientDomain: z.string().optional(),
  name: z.string().min(1),
  serviceLine: z.string().optional(),
  journeyStage: z.string().default("stage_0"),
  category: z.enum(["engagement", "creative_design", "creative_video", "partner"]).default("engagement"),
  leadUserId: z.string().uuid().optional().or(z.literal("")),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  aurasellAccountId: z.string().optional(),
  aurasellOpportunityId: z.string().optional(),
  driveFolderUrl: z.string().optional(),
  slackInternalChannelId: z.string().optional(),
  slackExternalChannelId: z.string().optional(),
});

export async function createEngagement(formData: FormData) {
  const me = await requireUser();
  const d = CreateSchema.parse(Object.fromEntries(formData));
  const domain = d.clientDomain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;

  let client = await db.query.clients.findFirst({ where: eq(clients.name, d.clientName.trim()) });
  if (!client) {
    [client] = await db.insert(clients).values({ name: d.clientName.trim(), domain, aurasellAccountId: d.aurasellAccountId || null }).returning();
  }
  let slug = slugify(`${d.clientName}-${d.name}`);
  if (await db.query.engagements.findFirst({ where: eq(engagements.slug, slug) })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const [e] = await db.insert(engagements).values({
    slug, clientId: client!.id, name: d.name.trim(), serviceLine: d.serviceLine || null, category: d.category,
    journeyStage: d.journeyStage as typeof engagements.$inferInsert.journeyStage,
    leadUserId: d.leadUserId || me.id, startDate: d.startDate || null, endDate: d.endDate || null,
    aurasellOpportunityId: d.aurasellOpportunityId || null, driveFolderUrl: d.driveFolderUrl || null,
    slackInternalChannelId: d.slackInternalChannelId || null, slackExternalChannelId: d.slackExternalChannelId || null,
    createdBy: me.id,
  }).returning();

  const lead = d.leadUserId || me.id;
  await db.insert(engagementMembers).values({ engagementId: e!.id, userId: lead, projectRole: "Engagement Lead", tags: ["Lead"] }).onConflictDoNothing();
  if (lead !== me.id) await db.insert(engagementMembers).values({ engagementId: e!.id, userId: me.id }).onConflictDoNothing();

  const sources: { kind: string; value: string }[] = [];
  if (domain) sources.push({ kind: "email_domain", value: domain });
  if (d.aurasellAccountId) sources.push({ kind: "aurasell_account", value: d.aurasellAccountId });
  for (const ch of [d.slackInternalChannelId, d.slackExternalChannelId]) if (ch) sources.push({ kind: "slack_channel", value: ch });
  if (sources.length) await db.insert(engagementSources).values(sources.map((s) => ({ ...s, engagementId: e!.id }))).onConflictDoNothing();

  await logActivity({ engagementId: e!.id, actorId: me.id, entityType: "engagement", entityId: e!.id, action: "created", summary: `created the ${d.category === "engagement" ? "engagement" : d.category === "partner" ? "partner project" : d.category === "creative_video" ? "video project" : "graphic design project"}` });
  revalidatePath("/", "layout");
  redirect(`/e/${e!.slug}`);
}

export async function setJourneyStage(engagementId: string, stage: string) {
  const me = await requireUser();
  const [e] = await db.update(engagements)
    .set({ journeyStage: stage as typeof engagements.$inferInsert.journeyStage, updatedAt: new Date(), archivedAt: stage === "closed_lost" ? new Date() : null })
    .where(eq(engagements.id, engagementId)).returning();
  await logActivity({ engagementId, actorId: me.id, entityType: "engagement", entityId: engagementId, action: "stage_changed", summary: `moved the engagement to ${journeyLabel(stage)}` });
  if (stage === "closed_won") await postToChannel(e?.slackInternalChannelId, `:tada: ${e?.name} is Closed Won. Next up: Kickoff.`);
  revalidatePath("/", "layout");
}

export async function updateEngagement(engagementId: string, patch: Partial<{
  name: string; health: string; driveFolderUrl: string | null; aurasellOpportunityId: string | null;
  slackInternalChannelId: string | null; slackExternalChannelId: string | null; startDate: string | null; endDate: string | null; serviceLine: string | null; category: string;
}>) {
  const me = await requireUser();
  await db.update(engagements).set({ ...patch, updatedAt: new Date() }).where(eq(engagements.id, engagementId));
  for (const key of ["slackInternalChannelId", "slackExternalChannelId"] as const) {
    if (patch[key]) await db.insert(engagementSources).values({ engagementId, kind: "slack_channel", value: patch[key]! }).onConflictDoNothing();
  }
  await logActivity({ engagementId, actorId: me.id, entityType: "engagement", entityId: engagementId, action: "updated", summary: `updated engagement details` });
  revalidatePath("/", "layout");
}

export async function addMember(engagementId: string, userId: string, projectRole: string, tags: string[]) {
  const me = await requireUser();
  await db.insert(engagementMembers).values({ engagementId, userId, projectRole: projectRole || null, tags })
    .onConflictDoUpdate({ target: [engagementMembers.engagementId, engagementMembers.userId], set: { projectRole: projectRole || null, tags } });
  const e = await db.query.engagements.findFirst({ where: eq(engagements.id, engagementId) });
  await logActivity({ engagementId, actorId: me.id, entityType: "member", entityId: userId, action: "assigned", summary: `added a team member${projectRole ? ` as ${projectRole}` : ""}` });
  if (userId !== me.id) await dmUser(userId, `${me.name} added you to *${e?.name}*${projectRole ? ` as ${projectRole}` : ""}. ${appUrl()}/e/${e?.slug}`);
  revalidatePath("/", "layout");
}

export async function addMemberByEmail(engagementId: string, email: string, name: string, projectRole: string, tags: string[]) {
  const { invitePerson } = await import("./people");
  const u = await invitePerson(email, name);
  await addMember(engagementId, u.id, projectRole, tags);
}

export async function removeMember(engagementId: string, userId: string) {
  await requireUser();
  await db.delete(engagementMembers).where(and(eq(engagementMembers.engagementId, engagementId), eq(engagementMembers.userId, userId)));
  revalidatePath("/", "layout");
}

export async function addSource(engagementId: string, kind: string, value: string) {
  await requireUser();
  if (!value.trim()) return;
  await db.insert(engagementSources).values({ engagementId, kind, value: value.trim().toLowerCase() }).onConflictDoNothing();
  revalidatePath("/", "layout");
}

export async function removeSource(engagementId: string, kind: string, value: string) {
  await requireUser();
  await db.delete(engagementSources).where(and(eq(engagementSources.engagementId, engagementId), eq(engagementSources.kind, kind), eq(engagementSources.value, value)));
  revalidatePath("/", "layout");
}
