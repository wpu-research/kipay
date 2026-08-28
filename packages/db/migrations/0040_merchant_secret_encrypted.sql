-- keyId-only auth: secret_hash (geri döndürülemez) → secret_encrypted (AES-256-GCM, çözülebilir)
-- HMAC doğrulaması için ham secret gerektiğinden, secret artık şifreli saklanır.
--
-- DİKKAT: Mevcut secret_hash değerleri GERİ DÖNÜŞTÜRÜLEMEZ. Bu migration'dan sonra
-- tüm merchant API key'leri ROTATE edilmeli (yeni secret üretilip merchant'a iletilmeli).
-- Eski hash'li key'ler artık doğrulanamaz.

ALTER TABLE "merchant_api_keys" ADD COLUMN "secret_encrypted" text;

-- Eski hash'li kayıtlar çözülemez — placeholder ile işaretle, rotate zorunlu.
UPDATE "merchant_api_keys"
   SET "secret_encrypted" = 'LEGACY_NEEDS_ROTATION'
 WHERE "secret_encrypted" IS NULL;

ALTER TABLE "merchant_api_keys" ALTER COLUMN "secret_encrypted" SET NOT NULL;
ALTER TABLE "merchant_api_keys" DROP COLUMN "secret_hash";
