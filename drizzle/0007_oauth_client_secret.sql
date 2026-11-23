ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "auth_method" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN IF NOT EXISTS "secret_hash" text;
