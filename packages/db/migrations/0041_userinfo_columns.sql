-- v1.1 userInfo: transactions tablosuna üye kimlik alanları
ALTER TABLE "transactions"
  ADD COLUMN "user_identity_number" text,
  ADD COLUMN "user_member_id"       text,
  ADD COLUMN "user_first_name"      text,
  ADD COLUMN "user_middle_name"     text DEFAULT '',
  ADD COLUMN "user_last_name"       text,
  ADD COLUMN "user_phone"           text;

CREATE INDEX IF NOT EXISTS "idx_tx_user_member_id" ON "transactions"("user_member_id");
