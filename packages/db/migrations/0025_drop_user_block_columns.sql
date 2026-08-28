ALTER TABLE "users" DROP COLUMN IF EXISTS "blocked_until";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "is_permanently_blocked";
