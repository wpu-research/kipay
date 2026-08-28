# keyId-only Auth Değişikliği — Özet

Spec ile sistem arasındaki uyumsuzluk giderildi: X-API-Key artık SADECE keyId
taşıyor, secret ağda dolaşmıyor. Ayrıca timestamp ISO 8601 kabul ediyor.

## Değişen dosyalar
1. apps/api/src/lib/secret-crypto.ts        (YENİ) — AES-256-GCM şifrele/çöz
2. packages/db/src/schema/merchant-api-keys.ts — secret_hash → secret_encrypted
3. packages/db/migrations/0040_merchant_secret_encrypted.sql (YENİ)
4. apps/api/src/middleware/merchant-hmac.ts   — keyId-only + decrypt + ISO ts
5. apps/api/src/features/merchants/merchant-api-key.service.ts — encrypt
6. packages/db/src/create-test-merchant.ts    — encrypt
7. Testler güncellendi (merchant-hmac.test, merchant-api-key.service.test)

## NEDEN hash değil encrypt?
HMAC doğrulaması için ham secret gerekir. keyId-only'de secret header'da
gelmediğinden, DB'den ÇÖZÜLEBİLİR olması şart. Hash geri döndürülemez, o yüzden
AES-256-GCM ile şifreli saklıyoruz. DB sızsa bile MERCHANT_SECRET_ENC_KEY
olmadan secret'lar çözülemez.

## GEREKLİ ENV (deploy'dan önce)
MERCHANT_SECRET_ENC_KEY=<en az 32 karakter rastgele string>
  Üret: openssl rand -hex 32
  ⚠️ Bu key kaybolursa TÜM merchant secret'ları çözülemez → hepsi rotate edilir.
  ⚠️ Bu key değişirse eski secret'lar çözülemez → rotate gerekir.

## DEPLOY SONRASI
- Migration 0040 çalışınca eski secret_hash'li key'ler 'LEGACY_NEEDS_ROTATION'
  placeholder alır (çözülemezler). Her merchant için API key ROTATE edilmeli
  (panelden veya rotateApiKey ile) → yeni secret üretilip merchant'a iletilir.
- Sandbox'ta zaten yeni key üreteceğin için sorun değil.

## SPEC ARTIK SİSTEMLE UYUMLU
- X-API-Key: keyId (secret yok) ✓
- X-Timestamp: ISO 8601 (epoch de kabul, geriye uyumlu) ✓
- X-Signature: sha256= prefix'li veya öneksiz, ikisi de çalışır ✓
- X-Nonce: replay koruması (mevcut, değişmedi) ✓
- IP whitelist: mevcut (merchant_ip_whitelist tablosu, değişmedi) ✓
