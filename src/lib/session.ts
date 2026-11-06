import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Me = typeof users.$inferSelect;

export async function requireUser(): Promise<Me> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const me = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!me) redirect("/login");
  return me;
}

export async function requireAdmin(): Promise<Me> {
  const me = await requireUser();
  if (me.role !== "admin") throw new Error("Admins only");
  return me;
}
