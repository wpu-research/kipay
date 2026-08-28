# Supabase DATABASE_URL — Dikkat

Supabase iki bağlantı verir:
1. Direct (5432)  — migration için KULLAN
2. Pooler (6543, pgbouncer) — uygulama runtime için

Drizzle migration'ları pooler'da (transaction mode) SORUN çıkarabilir.
Öneri:
- migrate.js çalıştırırken DIRECT bağlantı (port 5432) kullan
- runtime'da pooler (6543) kullan

Pratikte en kolayı: başlangıçta ikisini de dene, migration direct ile geçsin.
Railway'de tek DATABASE_URL varsa, DIRECT (5432) olanı ver — düşük trafikte pooler şart değil.

Connection string'i alırken şifredeki özel karakterler URL-encode edilmeli
(örn. @ → %40). Supabase'in verdiği hazır URI zaten encode'lu gelir.
