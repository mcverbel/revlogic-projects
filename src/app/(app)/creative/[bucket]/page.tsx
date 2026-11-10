import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, engagements, phases } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { CREATIVE_BOARDS } from "@/lib/constants";

/** Each Creative bucket has one shared board. Opening the bucket opens its board's task list (created on first visit). */
export default async function CreativeBucket({ params }: { params: Promise<{ bucket: string }> }) {
  const me = await requireUser();
  const { bucket } = await params;
  const board = CREATIVE_BOARDS.find((b) => b.bucket === bucket);
  if (!board) notFound();

  let e = await db.query.engagements.findFirst({ where: eq(engagements.slug, board.slug) });
  if (!e) {
    let client = await db.query.clients.findFirst({ where: eq(clients.name, "revlogic") });
    if (!client) [client] = await db.insert(clients).values({ name: "revlogic" }).returning();
    [e] = await db.insert(engagements).values({
      slug: board.slug, clientId: client!.id, name: board.name, category: board.category,
      journeyStage: "in_delivery", leadUserId: me.id, createdBy: me.id,
    }).onConflictDoNothing().returning();
    e ??= await db.query.engagements.findFirst({ where: eq(engagements.slug, board.slug) });
    if (e) await db.insert(phases).values({ engagementId: e.id, name: "Open requests", sortOrder: 0 }).onConflictDoNothing();
  }
  redirect(`/e/${board.slug}/plan`);
}
