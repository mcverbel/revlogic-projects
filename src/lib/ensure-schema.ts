// Small, additive schema changes the app applies itself when it starts, so a deploy works even if
// `npm run db:migrate` wasn't run. Every statement is safe to repeat. Same SQL as drizzle/0008.
import { sql } from "drizzle-orm";
import { db } from "@/db";

const STATEMENTS = [
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "is_content" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "content_format" text`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "parent_task_id" uuid REFERENCES "public"."tasks"("id") ON DELETE cascade`,
  `CREATE INDEX IF NOT EXISTS "tasks_parent" ON "tasks" ("parent_task_id")`,
];

export async function ensureSchema() {
  for (const s of STATEMENTS) await db.execute(sql.raw(s));
}
