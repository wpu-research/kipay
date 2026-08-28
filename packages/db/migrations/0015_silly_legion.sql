CREATE TYPE "public"."transaction_type" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
ALTER TYPE "public"."transaction_status" ADD VALUE 'TIMEOUT';--> statement-breakpoint
ALTER TYPE "public"."transaction_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "payment_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "type" "transaction_type" DEFAULT 'deposit' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "started_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payment_method" text;