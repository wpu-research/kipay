CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "callback_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"response_status" integer,
	"response_body" text,
	"success" boolean NOT NULL,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "callback_secret" text;
UPDATE merchants SET callback_secret = encode(gen_random_bytes(32), 'hex') WHERE callback_secret IS NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "callback_status" text;--> statement-breakpoint
ALTER TABLE "callback_logs" ADD CONSTRAINT "callback_logs_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;