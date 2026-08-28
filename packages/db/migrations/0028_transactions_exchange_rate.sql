ALTER TABLE "transactions"
  ADD COLUMN "exchange_rate" numeric(18, 8),
  ADD COLUMN "amount_try"   numeric(18, 2);
