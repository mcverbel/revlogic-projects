"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { connections, apiTokens } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { encrypt, newToken, sha256 } from "@/lib/crypto";

export async function disconnect(provider: "gmail" | "slack_user" | "otter" | "aurasell") {
  const me = await requireUser();
  await db.delete(connections).where(and(eq(connections.userId, me.id), eq(connections.provider, provider)));
  revalidatePath("/connections");
}

export async function saveOtterKey(apiKey: string) {
  const me = await requireUser();
  if (!apiKey.trim()) return;
  await db.delete(connections).where(and(eq(connections.userId, me.id), eq(connections.provider, "otter")));
  await db.insert(connections).values({ scope: "user", userId: me.id, provider: "otter", encryptedToken: encrypt(apiKey.trim()) });
  revalidatePath("/connections");
}

/** Personal token for the Claude tracker connector. Shown once. */
export async function createApiToken(label: string) {
  const me = await requireUser();
  const token = newToken();
  await db.insert(apiTokens).values({ userId: me.id, tokenHash: sha256(token), label: label || "Claude" });
  revalidatePath("/connections");
  return token;
}

export async function revokeApiToken(id: string) {
  const me = await requireUser();
  await db.delete(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, me.id)));
  revalidatePath("/connections");
}
