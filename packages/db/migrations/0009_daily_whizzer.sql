CREATE TABLE "finance_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finance_group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "finance_group_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_group_members" ADD CONSTRAINT "finance_group_members_finance_group_id_finance_groups_id_fk" FOREIGN KEY ("finance_group_id") REFERENCES "public"."finance_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_group_members" ADD CONSTRAINT "finance_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_group_members" ADD CONSTRAINT "finance_group_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_groups" ADD CONSTRAINT "finance_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_group_members_group_user_unique" ON "finance_group_members" USING btree ("finance_group_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_groups_tenant_name_unique" ON "finance_groups" USING btree ("tenant_id","name");--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_finance_group_id_finance_groups_id_fk" FOREIGN KEY ("finance_group_id") REFERENCES "public"."finance_groups"("id") ON DELETE set null ON UPDATE no action;