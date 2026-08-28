import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => ({
  db: {
    select:  vi.fn(),
    update:  vi.fn(),
    $count:  vi.fn(),
  },
  paymentAccounts: {},
  transactions:    {},
  eq:      vi.fn((col, val) => ({ col, val })),
  and:     vi.fn((...args: unknown[]) => args),
  gt:      vi.fn((col, val) => ({ col, val, gt: true })),
  not:     vi.fn((expr) => ({ not: expr })),
  inArray: vi.fn((col, subq) => ({ col, subq, inArray: true })),
}))

import { db } from '@panel/db'
import { dailyLimitReset } from './daily-limit-reset.js'

const mockSelect = db.select as ReturnType<typeof vi.fn>
const mockUpdate = db.update as ReturnType<typeof vi.fn>

function makeSelectChain(returnValue: unknown[]) {
  const from = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue(returnValue),
  })
  return { from }
}

function makeUpdateChain() {
  const set = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  })
  return { set }
}

describe('dailyLimitReset', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('aktif claim olmayan hesapları sıfırlar', async () => {
    // SELECT subquery için select chain
    mockSelect.mockReturnValueOnce(makeSelectChain([]))
    // UPDATE için update chain
    mockUpdate.mockReturnValueOnce(makeUpdateChain())

    await expect(dailyLimitReset(null)).resolves.toBeUndefined()
    expect(mockUpdate).toHaveBeenCalledOnce()
  })

  it('hatasız tamamlanır (iş süreci kontrolü)', async () => {
    mockSelect.mockReturnValueOnce(makeSelectChain([{ paymentAccountId: 'paid-1' }]))
    mockUpdate.mockReturnValueOnce(makeUpdateChain())

    await expect(dailyLimitReset({})).resolves.toBeUndefined()
  })
})
