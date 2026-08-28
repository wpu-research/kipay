-- Desteklenmeyen kriptolara bağlı payment_account_cryptos kayıtlarını sil
DELETE FROM payment_account_cryptos
WHERE crypto_id IN (
  SELECT id FROM cryptos
  WHERE symbol NOT IN ('BTC', 'ETH', 'XRP', 'TRX', 'DOGE', 'USDT')
);

-- Desteklenmeyen kriptoları sil
DELETE FROM cryptos
WHERE symbol NOT IN ('BTC', 'ETH', 'XRP', 'TRX', 'DOGE', 'USDT');
