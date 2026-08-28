ALTER TABLE "users" ADD COLUMN "blocked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_permanently_blocked" boolean DEFAULT false NOT NULL;