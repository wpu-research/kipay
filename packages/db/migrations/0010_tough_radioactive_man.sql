CREATE TYPE "public"."payment_account_environment" AS ENUM('sandbox', 'production');--> statement-breakpoint
CREATE TYPE "public"."payment_account_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"finance_group_id" uuid NOT NULL,
	"payment_provider_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_number" text NOT NULL,
	"environment" "payment_account_environment" NOT NULL,
	"status" "payment_account_status" DEFAULT 'active' NOT NULL,
	"daily_limit" numeric(18, 2) NOT NULL,
	"daily_used" numeric(18, 2) DEFAULT '0' NOT NULL,
	"last_reset_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_finance_group_id_finance_groups_id_fk" FOREIGN KEY ("finance_group_id") REFERENCES "public"."finance_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_payment_provider_id_payment_providers_id_fk" FOREIGN KEY ("payment_provider_id") REFERENCES "public"."payment_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_group_provider_env_unique" ON "payment_accounts" USING btree ("finance_group_id","payment_provider_id","environment");