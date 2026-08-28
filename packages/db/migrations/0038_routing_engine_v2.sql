-- routing engine v2: payment_accounts.owned_by_user_id

ALTER TABLE "payment_accounts"
  ADD COLUMN "owned_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_pa_owned_by_user_id" ON "payment_accounts"("owned_by_user_id");
