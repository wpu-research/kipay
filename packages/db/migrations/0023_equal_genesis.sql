DROP TABLE "finance_group_members" CASCADE;--> statement-breakpoint
DROP TABLE "finance_groups" CASCADE;--> statement-breakpoint
ALTER TABLE "merchants" DROP COLUMN "contact_email";--> statement-breakpoint
ALTER TABLE "merchants" DROP COLUMN "contact_phone";--> statement-breakpoint
ALTER TABLE "merchants" DROP COLUMN "contact_address";