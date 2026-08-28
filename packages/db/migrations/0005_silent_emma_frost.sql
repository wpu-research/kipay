CREATE TYPE "public"."merchant_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"merchant_name" text NOT NULL,
	"webhook_url" text NOT NULL,
	"is_sandbox" boolean DEFAULT true NOT NULL,
	"status" "merchant_status" DEFAULT 'active' NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"contact_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;