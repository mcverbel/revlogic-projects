"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/session";

const allowedDomains = () => (process.env.ALLOWED_EMAIL_DOMAINS ?? "rev-logic.com").split(",").map((d) => d.trim().toLowerCase());

/** "vaughn.heaston@rev-logic.com" → "Vaughn Heaston" */
function nameFromEmail(email: string) {
  return email.split("@")[0]!.split(/[._-]+/).filter(Boolean).map((p) => p[0]!.toUpperCase() + p.slice(1)).join(" ");
}

/** Add a teammate by email before they've signed in. When they sign in with Google, the app matches this row by email. */
export async function invitePerson(emailRaw: string, nameRaw?: string): Promise<{ id: string; name: string }> {
  await requireUser();
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");
  if (!allowedDomains().includes(email.split("@")[1]!)) throw new Error(`Only ${allowedDomains().join(", ")} emails can be added`);
  const name = nameRaw?.trim() || nameFromEmail(email);
  const [u] = await db.insert(users).values({ email, name, role: "member" })
    .onConflictDoUpdate({ target: users.email, set: { email } }) // already exists: keep it as is
    .returning();
  revalidatePath("/", "layout");
  return { id: u!.id, name: u!.name };
}
