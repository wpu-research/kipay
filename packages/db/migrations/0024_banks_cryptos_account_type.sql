-- Bankalar tablosu (global preset, tenant bağımsız)
CREATE TABLE "banks" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"       text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "banks" ADD CONSTRAINT "banks_name_unique" UNIQUE("name");
--> statement-breakpoint

-- Kripto paralar tablosu (global preset, tenant bağımsız)
CREATE TABLE "cryptos" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"       text NOT NULL,
  "symbol"     text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cryptos" ADD CONSTRAINT "cryptos_name_unique"   UNIQUE("name");
--> statement-breakpoint
ALTER TABLE "cryptos" ADD CONSTRAINT "cryptos_symbol_unique" UNIQUE("symbol");
--> statement-breakpoint

-- payment_account_type enum
CREATE TYPE "public"."payment_account_type" AS ENUM('bank', 'crypto');
--> statement-breakpoint

-- payment_accounts: eski FK ve unique index kaldır, yeni kolonlar ekle
DROP INDEX IF EXISTS "payment_accounts_tenant_provider_env_unique";
--> statement-breakpoint
ALTER TABLE "payment_accounts" DROP CONSTRAINT IF EXISTS "payment_accounts_payment_provider_id_payment_providers_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN "type"    "public"."payment_account_type" NOT NULL DEFAULT 'bank';
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN "bank_id" uuid REFERENCES "public"."banks"("id");
--> statement-breakpoint
ALTER TABLE "payment_accounts" DROP COLUMN IF EXISTS "payment_provider_id";
--> statement-breakpoint

-- Hesap-kripto çoka-çok junction tablosu
CREATE TABLE "payment_account_cryptos" (
  "payment_account_id" uuid NOT NULL REFERENCES "public"."payment_accounts"("id") ON DELETE CASCADE,
  "crypto_id"          uuid NOT NULL REFERENCES "public"."cryptos"("id"),
  PRIMARY KEY ("payment_account_id", "crypto_id")
);
