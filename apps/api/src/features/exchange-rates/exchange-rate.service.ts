import { db, exchangeRates, cryptos, gt } from '@panel/db'
import { AppError } from '../../errors/app-error.js'

// CoinGecko ID eşlemesi — sembol → CoinGecko ID
// Yeni kripto eklendiğinde buraya da eklenmeli
const COINGECKO_IDS: Record<string, string> = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  XRP:  'ripple',
  TRX:  'tron',
  DOGE: 'dogecoin',
  USDT: 'tether',
  BNB:  'binancecoin',
  SOL:  'solana',
  ADA:  'cardano',
  LTC:  'litecoin',
}

// --- Harici sağlayıcı fetch fonksiyonları ---

async function fetchFromBinance(symbols: string[]): Promise<Array<{ fromCurrency: string; toCurrency: string; rate: string }>> {
  // 1. USDT/TRY kurunu al
  const usdtRes = await fetch('https://api.trbinance.com/api/v3/ticker/price?symbol=USDTTRY')
  if (!usdtRes.ok) throw new Error(`Binance TR USDTTRY HTTP ${usdtRes.status}`)
  const { price: usdtPrice } = await usdtRes.json() as { price: string }
  const usdtTryRate = parseFloat(usdtPrice)

  const results: Array<{ fromCurrency: string; toCurrency: string; rate: string }> = []

  if (symbols.includes('USDT')) {
    results.push({ fromCurrency: 'USDT', toCurrency: 'TRY', rate: usdtTryRate.toFixed(8) })
  }

  const others = symbols.filter((s) => s !== 'USDT')
  if (others.length > 0) {
    const symbolsParam = encodeURIComponent(JSON.stringify(others.map((s) => `${s}USDT`)))
    const batchRes = await fetch(`https://api.trbinance.com/api/v3/ticker/price?symbols=${symbolsParam}`)
    if (!batchRes.ok) throw new Error(`Binance TR batch HTTP ${batchRes.status}`)
    const prices = await batchRes.json() as { symbol: string; price: string }[]

    for (const { symbol, price } of prices) {
      const crypto = symbol.slice(0, -4) // 'BTCUSDT' → 'BTC'
      const tryRate = parseFloat(price) * usdtTryRate
      results.push({ fromCurrency: crypto, toCurrency: 'TRY', rate: tryRate.toFixed(8) })
    }
  }

  return results
}

async function fetchFromCoinGecko(symbols: string[]): Promise<Array<{ fromCurrency: string; toCurrency: string; rate: string }>> {
  const known = symbols.filter((s) => COINGECKO_IDS[s])
  if (known.length === 0) throw new Error('CoinGecko: eşleşen sembol yok')

  const ids = known.map((s) => COINGECKO_IDS[s]).join(',')
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=try`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`)
  const json = await res.json() as Record<string, { try?: number }>

  return known.map((symbol) => {
    const id   = COINGECKO_IDS[symbol]
    const rate = json[id]?.try
    if (!rate) throw new Error(`CoinGecko: ${symbol} TRY verisi eksik`)
    return { fromCurrency: symbol, toCurrency: 'TRY', rate: rate.toFixed(8) }
  })
}

// --- Servis ---

export const exchangeRateService = {

  async syncFromExternal(): Promise<{ synced: number; source: string; fetchedAt: Date }> {
    // Sadece aktif kriptolar için kur çek
    const allCryptos = await db.select({ symbol: cryptos.symbol }).from(cryptos)
    const symbols = allCryptos.map((c) => c.symbol)

    if (symbols.length === 0) {
      return { synced: 0, source: 'none', fetchedAt: new Date() }
    }

    const providers = [
      { name: 'binance_tr', fn: () => fetchFromBinance(symbols)   },
      { name: 'coingecko',  fn: () => fetchFromCoinGecko(symbols) },
    ]

    for (const provider of providers) {
      try {
        const rates = await provider.fn()
        const now   = new Date()
        if (rates.length > 0) {
          await db.insert(exchangeRates).values(
            rates.map((r) => ({
              fromCurrency: r.fromCurrency,
              toCurrency:   r.toCurrency,
              rate:         r.rate,
              source:       provider.name,
              fetchedAt:    now,
              createdAt:    now,
            }))
          )
        }
        return { synced: rates.length, source: provider.name, fetchedAt: now }
      } catch (err) {
        // Bir sonraki sağlayıcıya geç
      }
    }

    throw new AppError('EXCHANGE_RATE_SYNC_FAILED', 'Tüm kur kaynakları başarısız oldu.', 503)
  },

  async getCurrent(): Promise<typeof exchangeRates.$inferSelect[]> {
    const allRates = await db.query.exchangeRates.findMany({
      orderBy: (t, { desc }) => [desc(t.fetchedAt)],
    })

    // Çift başına yalnızca en güncel kayıt
    const seen   = new Set<string>()
    const latest: typeof exchangeRates.$inferSelect[] = []
    for (const r of allRates) {
      const key = `${r.fromCurrency}/${r.toCurrency}`
      if (!seen.has(key)) {
        seen.add(key)
        latest.push(r)
      }
    }
    return latest
  },

  async isStale(thresholdMs = 15 * 60 * 1000): Promise<boolean> {
    const cutoff = new Date(Date.now() - thresholdMs)
    const fresh  = await db.query.exchangeRates.findFirst({
      where: gt(exchangeRates.fetchedAt, cutoff),
    })
    return !fresh
  },
}
