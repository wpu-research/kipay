#!/bin/sh
set -e

echo "=== API Entrypoint başladı ==="
echo "NODE_ENV: $NODE_ENV"
echo "DATABASE_URL mevcut: $([ -n "$DATABASE_URL" ] && echo 'EVET' || echo 'HAYIR')"
echo "JWT_SECRET mevcut: $([ -n "$JWT_SECRET" ] && echo 'EVET' || echo 'HAYIR')"

echo "=== Migration başlatılıyor... ==="
RETRIES=10
COUNT=0
until node apps/api/dist/migrate.js; do
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge $RETRIES ]; then
    echo "Migration $RETRIES denemeden sonra başarısız. Çıkılıyor."
    exit 1
  fi
  echo "Migration başarısız (deneme $COUNT/$RETRIES). 5s bekleniyoor..."
  sleep 5
done

echo "=== Sunucu başlatılıyor... ==="
exec node apps/api/dist/main.js
