"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { newToken, sha256 } from "@/lib/crypto";
import { canEditOptions } from "@/lib/design-board";
import { TEMP_TOKEN_LABEL } from "@/lib/asana-import";

/** A token for the migration prompt. It stops working 24 hours after it's created (checked in /api/mcp). */
export async function createMigrationToken(engagementId: string) {
  const me = await requireUser();
  if (!(await canEditOptions(me, engagementId))) throw new Error("Only the board owner or an admin can run the Asana migration.");
  const token = newToken();
  await db.insert(apiTokens).values({ userId: me.id, tokenHash: sha256(token), label: TEMP_TOKEN_LABEL });
  revalidatePath("/connections");
  return token;
}
