-- Ödeme hesabı → tedarik firması (payment_provider) bağlantısı
ALTER TABLE "payment_accounts"
  ADD COLUMN "provider_id" uuid REFERENCES "payment_providers"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "payment_accounts_provider_id_idx" ON "payment_accounts" ("provider_id");
