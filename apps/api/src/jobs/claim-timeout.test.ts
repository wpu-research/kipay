import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => ({
  db: {
    update: vi.fn(),
  },
  transactions: {},
  eq:  vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
}))

import { db } from '@panel/db'
import { claimTimeout } from './claim-timeout.js'

const mockUpdate = db.update as ReturnType<typeof vi.fn>

function makeUpdateChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  }
}

function makeBoss() {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

describe('claimTimeout — claim type (PROCESSING → PENDING)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('PROCESSING işlemi PENDING\'e döndürür ve log yazar', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockUpdate.mockReturnValue(makeUpdateChain([{ id: 'tx-1' }]))
    const boss = makeBoss()

    await claimTimeout({ data: { transactionId: 'tx-1' } }, boss as any)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('PENDING\'e döndürüldü'))
    expect(boss.send).not.toHaveBeenCalled()
    logSpy.mockRestore()
  })

  it('işlem zaten tamamlanmışsa "atlandı" log yazar', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockUpdate.mockReturnValue(makeUpdateChain([]))
    const boss = makeBoss()

    await claimTimeout({ data: { transactionId: 'tx-2' } }, boss as any)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('atlandı'))
    logSpy.mockRestore()
  })
})

describe('claimTimeout — started type (STARTED → TIMEOUT)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('STARTED deposit\'i TIMEOUT\'a geçirir ve callback-retry job\'ı kuyruğa alır', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockUpdate.mockReturnValue(makeUpdateChain([{ id: 'tx-3' }]))
    const boss = makeBoss()

    await claimTimeout({ data: { transactionId: 'tx-3', type: 'started' } }, boss as any)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("TIMEOUT'a geçirildi"))
    expect(boss.send).toHaveBeenCalledWith(
      'callback-retry',
      { transactionId: 'tx-3' },
      { retryLimit: 4, retryDelay: 120, singletonKey: 'tx-3' },
    )
    logSpy.mockRestore()
  })

  it('zaten confirm edilmiş deposit → "atlandı" log yazar, callback-retry gönderilmez', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockUpdate.mockReturnValue(makeUpdateChain([]))
    const boss = makeBoss()

    await claimTimeout({ data: { transactionId: 'tx-4', type: 'started' } }, boss as any)

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('atlandı'))
    expect(boss.send).not.toHaveBeenCalled()
    logSpy.mockRestore()
  })
})
