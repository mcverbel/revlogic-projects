CREATE TABLE IF NOT EXISTS "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"scope" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_hash" text NOT NULL UNIQUE,
	"refresh_hash" text NOT NULL UNIQUE,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
