CREATE TABLE IF NOT EXISTS "rate_sync_config" (
  "from_currency" text NOT NULL,
  "to_currency"   text NOT NULL,
  "sync_enabled"  boolean NOT NULL DEFAULT true,
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("from_currency", "to_currency")
);
