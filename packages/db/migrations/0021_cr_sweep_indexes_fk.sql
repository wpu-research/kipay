-- Migration 0021: CR sweep — performance indexes + FK constraints
-- blocked_players hot-path index: checkPlayerBlocked sorgusu için (merchant_id, external_user_id)
CREATE INDEX IF NOT EXISTS "blocked_players_merchant_player_idx"
  ON "blocked_players" ("merchant_id", "external_user_id");
--> statement-breakpoint
-- blocked_players tenant + createdAt listeleme indeksi
CREATE INDEX IF NOT EXISTS "blocked_players_tenant_created_idx"
  ON "blocked_players" ("tenant_id", "created_at" DESC);
--> statement-breakpoint
-- system_settings.updated_by → users.id FK (nullable; kullanıcı silinse ayar korunur)
ALTER TABLE "system_settings"
  ADD CONSTRAINT "system_settings_updated_by_users_id_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
