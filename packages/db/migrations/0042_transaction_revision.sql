-- v1.1 revision: terminal işlem (REJECTED/TIMEOUT) sonradan APPROVED'a çevrildiğinde işaretlenir
ALTER TABLE "transactions"
  ADD COLUMN "revised" boolean NOT NULL DEFAULT false,
  ADD COLUMN "previous_status" "transaction_status";
