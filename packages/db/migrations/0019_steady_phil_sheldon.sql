CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"format" text NOT NULL,
	"filters" jsonb DEFAULT '{}' NOT NULL,
	"file_path" text,
	"requested_by_user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"role" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
