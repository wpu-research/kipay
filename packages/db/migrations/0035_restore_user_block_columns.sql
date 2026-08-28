ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_permanently_blocked" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "blocked_until" timestamp with time zone;
