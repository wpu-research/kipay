import { exchangeRateService } from '../features/exchange-rates/exchange-rate.service.js'

export async function rateSync(_job: unknown): Promise<void> {
  try {
    const result = await exchangeRateService.syncFromExternal()
    console.info(`[rate-sync] ${result.synced} kur senkronize edildi — kaynak: ${result.source}`)
  } catch (err) {
    // Job crash'lememesi için hata loglanır, fırlatılmaz
    console.error('[rate-sync] Senkronizasyon başarısız:', err)
  }
}
