ALTER TABLE "merchants" DROP CONSTRAINT "merchants_finance_group_id_finance_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_accounts" DROP CONSTRAINT "payment_accounts_finance_group_id_finance_groups_id_fk";
--> statement-breakpoint
DROP INDEX "payment_accounts_group_provider_env_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "merchant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_tenant_provider_env_unique" ON "payment_accounts" USING btree ("tenant_id","payment_provider_id","environment");--> statement-breakpoint
ALTER TABLE "merchants" DROP COLUMN "finance_group_id";--> statement-breakpoint
ALTER TABLE "payment_accounts" DROP COLUMN "finance_group_id";--> statement-breakpoint
ALTER TABLE "public"."audit_logs" ALTER COLUMN "user_role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
UPDATE "public"."users" SET "role" = CASE "role"
  WHEN 'firma'    THEN 'tenant_admin'
  WHEN 'finans'   THEN 'finans_admin'
  WHEN 'operator' THEN 'finans_operator'
  ELSE "role"
END;--> statement-breakpoint
UPDATE "public"."audit_logs" SET "user_role" = CASE "user_role"
  WHEN 'firma'    THEN 'tenant_admin'
  WHEN 'finans'   THEN 'finans_admin'
  WHEN 'operator' THEN 'finans_operator'
  ELSE "user_role"
END;--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'tenant_admin', 'finans_admin', 'finans_operator', 'merchant');--> statement-breakpoint
ALTER TABLE "public"."audit_logs" ALTER COLUMN "user_role" SET DATA TYPE "public"."user_role" USING "user_role"::"public"."user_role";--> statement-breakpoint
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";