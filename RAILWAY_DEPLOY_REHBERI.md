# Kipay — Railway'e Tam Deploy (API + Web + Postgres, hepsi tek yerde)

Bu monorepo Railway'de 3 parça olarak çalışır:
  • Postgres  (Railway'in kendi DB'si)
  • API        (apps/api — Fastify, adamlar buraya bağlanır)
  • Web        (apps/web — Next.js panel, siz kullanırsınız)

## ADIM 1 — Kodu GitHub'a koy
Bu paketteki dosyaları asıl monorepo'ya uygula, sonra:
  git init && git add . && git commit -m "keyId-only + railway config"
  # GitHub'da PRIVATE repo aç (ödeme kodu — public olmasın)
  git remote add origin <repo-url> && git push -u origin main
.gitignore .env'i dışlıyor — secret sızmaz.

## ADIM 2 — Railway'de Postgres oluştur
Railway → New Project → "Provision PostgreSQL" (Database seçeneği).
Oluşunca Railway otomatik bir DATABASE_URL değişkeni sağlar (Variables'ta görünür).
Bu URL'i API servisine referansla vereceğiz (aşağıda).

## ADIM 3 — API servisi ekle
New Service → GitHub Repo → monorepo'nu seç.
Settings:
  • Service adı: api
  • Root Directory: apps/api
  • (Build/start apps/api/railway.json'dan otomatik okunur)
Variables (API servisine):
  DATABASE_URL=${{Postgres.DATABASE_URL}}    # Railway referans sözdizimi
  JWT_SECRET=<openssl rand -hex 32>
  JWT_REFRESH_SECRET=<openssl rand -hex 32>
  JWT_TEMP_SECRET=<openssl rand -hex 32>
  TOTP_ENCRYPTION_KEY=<openssl rand -hex 32>       # tam 64 hex
  MERCHANT_SECRET_ENC_KEY=<openssl rand -hex 32>   # KAYBETME
  COOKIE_SECRET=<openssl rand -hex 32>
  NODE_ENV=production
  HOST=0.0.0.0
  # PORT'u Railway otomatik verir, dokunma
  FRONTEND_URL=<Web servisinin public URL'i — Adım 5'te öğrenilecek>

İlk deploy'da migrate.js çalışır → 40+ migration + 0040 uygulanır.
Deploy sonrası API'ye bir public domain ver (Settings → Networking → Generate Domain).
Bu domain adamlara verilecek API endpoint'i olur.

## ADIM 4 — Web servisi ekle
New Service → aynı GitHub Repo (ikinci kez).
Settings:
  • Service adı: web
  • Root Directory: apps/web
Variables (Web servisine):
  NEXT_PUBLIC_API_URL=<API servisinin public domain'i, https://...>
  API_INTERNAL_URL=<API'nin internal adresi, örn http://api.railway.internal:PORT>
  NODE_ENV=production
Web'e de public domain ver → panel adresin bu olur.

## ADIM 5 — Bağlantıları tamamla
- API'nin FRONTEND_URL'ini Web'in domain'iyle güncelle (CORS için).
- Web'in NEXT_PUBLIC_API_URL'ini API domain'iyle güncelle.
- İki servisi de redeploy et.

## ADIM 6 — İlk kullanıcı + test merchant
Railway → API servisi → Shell (veya lokalden DATABASE_URL ile):
  pnpm --filter @panel/db exec tsx src/create-test-merchant.ts
Bu bir test merchant + API key üretir. Çıktıdaki keyId + secret = adamlara
verilecek sandbox credential. (secret sadece bir kez gösterilir.)

## KRİTİK
- MERCHANT_SECRET_ENC_KEY kaybolursa tüm merchant secret'ları çözülemez.
- İlk deploy'da build ilk seferde takılırsa log'u kontrol et: genelde pnpm
  workspace kök dizin bulma veya migration bağlantı sorunudur — çözülür.
