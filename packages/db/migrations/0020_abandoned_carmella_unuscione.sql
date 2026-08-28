CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid
);

INSERT INTO system_settings(key, value) VALUES ('claim_timeout_minutes', '10') ON CONFLICT DO NOTHING;
