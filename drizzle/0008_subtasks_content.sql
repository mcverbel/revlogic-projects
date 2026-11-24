ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "is_content" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "content_format" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "parent_task_id" uuid REFERENCES "public"."tasks"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_parent" ON "tasks" ("parent_task_id");
