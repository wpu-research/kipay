-- Önce null tenant_id'li kullanıcıları 'super-admin' tenant'ına bağla
-- (tenant yoksa oluştur)
WITH upsert AS (
  INSERT INTO tenants (name, slug, status)
  VALUES ('Super Admin', 'super-admin', 'active')
  ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
  RETURNING id
)
UPDATE users SET tenant_id = (SELECT id FROM upsert) WHERE tenant_id IS NULL;

-- NOT NULL kısıtını geri ekle
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;
