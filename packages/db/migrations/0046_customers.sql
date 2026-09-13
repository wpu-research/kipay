-- Son kullanıcı (oyuncu) merkezi kayıt defteri

CREATE TABLE IF NOT EXISTS "customers" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"        uuid NOT NULL REFERENCES "tenants"("id"),
  "merchant_id"      uuid NOT NULL REFERENCES "merchants"("id") ON DELETE CASCADE,
  "external_user_id" text NOT NULL,
  "identity_number"  text,
  "first_name"       text,
  "last_name"        text,
  "phone"            text,
  "deposit_count"    integer NOT NULL DEFAULT 0,
  "first_seen_at"    timestamptz NOT NULL DEFAULT now(),
  "last_seen_at"     timestamptz NOT NULL DEFAULT now(),
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "customers_merchant_external_user_unique" ON "customers" ("merchant_id", "external_user_id");
CREATE INDEX IF NOT EXISTS "customers_tenant_id_idx"        ON "customers" ("tenant_id");
CREATE INDEX IF NOT EXISTS "customers_identity_number_idx"  ON "customers" ("identity_number");
CREATE INDEX IF NOT EXISTS "customers_phone_idx"            ON "customers" ("phone");

-- Mevcut işlemlerden backfill: her (merchant, kullanıcı) için en son KYC + ilk/son görülme
INSERT INTO "customers" (tenant_id, merchant_id, external_user_id, identity_number, first_name, last_name, phone, deposit_count, first_seen_at, last_seen_at)
SELECT t.tenant_id, t.merchant_id, t.external_user_id,
       t.user_identity_number, t.user_first_name, t.user_last_name, t.user_phone,
       agg.cnt, agg.first_seen, agg.last_seen
FROM (
  SELECT DISTINCT ON (merchant_id, external_user_id) *
  FROM "transactions"
  WHERE type = 'deposit' AND external_user_id IS NOT NULL
  ORDER BY merchant_id, external_user_id, created_at DESC
) t
JOIN (
  SELECT merchant_id, external_user_id,
         COUNT(*)::int AS cnt, MIN(created_at) AS first_seen, MAX(created_at) AS last_seen
  FROM "transactions"
  WHERE type = 'deposit' AND external_user_id IS NOT NULL
  GROUP BY merchant_id, external_user_id
) agg ON agg.merchant_id = t.merchant_id AND agg.external_user_id = t.external_user_id
ON CONFLICT ("merchant_id", "external_user_id") DO NOTHING;
