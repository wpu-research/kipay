-- Bankalar tablosuna IBAN banka kodu kolonu eklendi (TR IBAN'ında index 4-8 arası 5 haneli kod)
ALTER TABLE "banks" ADD COLUMN "iban_code" text;
