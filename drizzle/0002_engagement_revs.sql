CREATE TABLE "engagement_revs" (
	"engagement_id" uuid NOT NULL,
	"rev" text NOT NULL,
	"framework_applied_at" timestamp with time zone,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_revs_engagement_id_rev_pk" PRIMARY KEY("engagement_id","rev")
);
--> statement-breakpoint
CREATE TABLE "framework_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rev" text NOT NULL,
	"sort_order" integer NOT NULL,
	"kind" text NOT NULL,
	"number" text,
	"title" text NOT NULL,
	"duration_weeks" integer DEFAULT 1 NOT NULL,
	"repeats" text,
	"owner_role" text,
	"client_input" text,
	"output" text,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement_revs" ADD CONSTRAINT "engagement_revs_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_revs" ADD CONSTRAINT "engagement_revs_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_steps" ADD CONSTRAINT "framework_steps_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "framework_steps_rev" ON "framework_steps" USING btree ("rev","sort_order");--> statement-breakpoint
INSERT INTO "engagement_revs" ("engagement_id", "rev")
SELECT e."id", r."rev" FROM "engagements" e
CROSS JOIN (VALUES ('pipelineREV'), ('dealREV'), ('growthREV'), ('rampREV'), ('partnerREV'), ('leaderREV'), ('valueREV'), ('roiREV'), ('SKO'), ('AI Solutions')) AS r("rev")
WHERE e."service_line" ILIKE '%' || r."rev" || '%'
ON CONFLICT DO NOTHING;
