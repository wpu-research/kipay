CREATE TABLE "nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_nonces_expires_at" ON "nonces" USING btree ("expires_at");