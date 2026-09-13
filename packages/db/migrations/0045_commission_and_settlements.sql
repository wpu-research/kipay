-- Komisyon oranları, günlük mutabakat ve işlem üzerinde komisyon snapshot'ı

CREATE TABLE IF NOT EXISTS "merchant_commission_rates" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id"),
  "merchant_id"     uuid NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "payment_method"  text NOT NULL,
  "deposit_rate"    numeric(5,2) NOT NULL DEFAULT 0,
  "withdrawal_rate" numeric(5,2) NOT NULL DEFAULT 0,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_commission_rates_merchant_method_unique"
  ON "merchant_commission_rates" ("merchant_id", "payment_method");
CREATE INDEX IF NOT EXISTS "merchant_commission_rates_tenant_id_idx"
  ON "merchant_commission_rates" ("tenant_id");

CREATE TABLE IF NOT EXISTS "daily_settlements" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id"),
  "merchant_id"     uuid NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "settlement_date" date NOT NULL,
  "paid_to_us"      numeric(18,2) NOT NULL DEFAULT 0,
  "paid_by_us"      numeric(18,2) NOT NULL DEFAULT 0,
  "note"            text,
  "created_by"      uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "daily_settlements_merchant_date_unique"
  ON "daily_settlements" ("merchant_id", "settlement_date");
CREATE INDEX IF NOT EXISTS "daily_settlements_tenant_date_idx"
  ON "daily_settlements" ("tenant_id", "settlement_date");

-- Yatırım yöntemi + komisyon snapshot'ı
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "deposit_method"    text;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "commission_rate"   numeric(5,2);
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "commission_amount" numeric(18,2);

-- Geçmiş yatırımların yöntemi ödeme hesabı tipinden türetilir (kredi kartı henüz yok).
UPDATE "transactions" t
   SET "deposit_method" = CASE pa."type" WHEN 'crypto' THEN 'kripto' ELSE 'havale' END
  FROM "payment_accounts" pa
 WHERE t."payment_account_id" = pa."id"
   AND t."type" = 'deposit'
   AND t."deposit_method" IS NULL;

CREATE INDEX IF NOT EXISTS "transactions_deposit_method_idx" ON "transactions" ("deposit_method");
