import { db } from "@/db";
import { activityLog } from "@/db/schema";

export async function logActivity(a: {
  engagementId: string; actorId?: string | null; entityType: string; entityId?: string | null; action: string; summary: string;
}) {
  await db.insert(activityLog).values({ ...a, actorId: a.actorId ?? null, entityId: a.entityId ?? null });
}
