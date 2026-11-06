"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clientContacts, documents, engagementSources } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { driveMetadata } from "@/lib/sources/google";

export async function addContact(engagementId: string, c: { name: string; title?: string; email?: string; linkedinUrl?: string; roles?: string[]; notes?: string }) {
  const me = await requireUser();
  if (!c.name.trim()) return;
  await db.insert(clientContacts).values({
    engagementId, name: c.name.trim(), title: c.title || null, email: c.email || null, linkedinUrl: c.linkedinUrl || null,
    roles: c.roles?.length ? c.roles : [], notes: c.notes || null,
  });
  // A contact's email domain becomes an email source for suggested tasks
  const domain = c.email?.split("@")[1]?.toLowerCase();
  if (domain && !["gmail.com", "outlook.com", "yahoo.com", "hotmail.com"].includes(domain)) {
    await db.insert(engagementSources).values({ engagementId, kind: "email_domain", value: domain }).onConflictDoNothing();
  }
  await logActivity({ engagementId, actorId: me.id, entityType: "contact", action: "created", summary: `added client contact ${c.name.trim()}` });
  revalidatePath("/", "layout");
}

export async function updateContact(id: string, patch: Partial<{ name: string; title: string | null; email: string | null; linkedinUrl: string | null; roles: string[]; notes: string | null }>) {
  await requireUser();
  await db.update(clientContacts).set(patch).where(eq(clientContacts.id, id));
  revalidatePath("/", "layout");
}

export async function deleteContact(id: string) {
  await requireUser();
  await db.delete(clientContacts).where(eq(clientContacts.id, id));
  revalidatePath("/", "layout");
}

export async function addDocument(engagementId: string, d: { category: "governance" | "deliverable"; url: string; title?: string; docType?: string; source?: string; status?: string; notes?: string }) {
  const me = await requireUser();
  if (!d.url.trim()) return;
  // Fill title and file type from Google Drive when it's a Drive link and the person connected Google
  const meta = await driveMetadata(me.id, d.url.trim()).catch(() => null);
  await db.insert(documents).values({
    engagementId, category: d.category, url: d.url.trim(),
    title: d.title?.trim() || meta?.name || d.url.trim(),
    docType: d.docType || null, source: d.source || meta?.source || null, driveFileId: meta?.id ?? null,
    status: d.status || "Draft", notes: d.notes || null, ownerId: me.id, createdBy: me.id,
  });
  await logActivity({ engagementId, actorId: me.id, entityType: "document", action: "created", summary: `added ${d.title?.trim() || meta?.name || "a document"} to ${d.category === "governance" ? "Governance & Alignment" : "Deliverables & Client Assets"}` });
  revalidatePath("/", "layout");
}

export async function updateDocument(id: string, patch: Partial<{ title: string; notes: string | null; status: string | null; docType: string | null; ownerId: string | null }>) {
  await requireUser();
  await db.update(documents).set({ ...patch, updatedAt: new Date() }).where(eq(documents.id, id));
  revalidatePath("/", "layout");
}

export async function deleteDocument(id: string) {
  await requireUser();
  await db.delete(documents).where(eq(documents.id, id));
  revalidatePath("/", "layout");
}
