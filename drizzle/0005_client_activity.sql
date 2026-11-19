CREATE TABLE IF NOT EXISTS "client_activity" (
	"engagement_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action,
	"account_name" text,
	"meetings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
