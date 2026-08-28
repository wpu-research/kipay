-- deposit api v2: player_confirmed sinyali

ALTER TABLE "transactions"
  ADD COLUMN "player_confirmed" boolean NOT NULL DEFAULT false,
  ADD COLUMN "player_confirmed_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_tx_player_confirmed" ON "transactions"("player_confirmed");
