import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../features/exchange-rates/exchange-rate.service.js', () => ({
  exchangeRateService: {
    syncFromExternal: vi.fn(),
  },
}))

import { exchangeRateService } from '../features/exchange-rates/exchange-rate.service.js'
import { rateSync } from './rate-sync.js'

const mockSync = exchangeRateService.syncFromExternal as ReturnType<typeof vi.fn>

describe('rateSync job', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('başarılı sync: syncFromExternal çağrılır, hata fırlatılmaz', async () => {
    mockSync.mockResolvedValueOnce({ synced: 2, source: 'binance', fetchedAt: new Date() })

    await expect(rateSync(null)).resolves.toBeUndefined()
    expect(mockSync).toHaveBeenCalledOnce()
  })

  it('hata durumunda job crash etmez (hata loglanır, fırlatılmaz)', async () => {
    mockSync.mockRejectedValueOnce(new Error('Tüm kaynaklar başarısız'))

    await expect(rateSync(null)).resolves.toBeUndefined()
    expect(mockSync).toHaveBeenCalledOnce()
  })
})
