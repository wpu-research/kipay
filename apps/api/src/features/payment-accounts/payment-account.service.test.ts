import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => ({
  db: {
    insert:      vi.fn(),
    update:      vi.fn(),
    delete:      vi.fn(),
    transaction: vi.fn(),
    query: {
      paymentAccounts:  { findFirst: vi.fn() },
      financeGroups:    { findFirst: vi.fn() },
      paymentProviders: { findFirst: vi.fn() },
    },
  },
  paymentAccounts:  {},
  financeGroups:    {},
  paymentProviders: {},
  eq:  vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  sql: vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

import { db } from '@panel/db'
import { paymentAccountService } from './payment-account.service.js'

const mockDb = db as unknown as {
  insert:      ReturnType<typeof vi.fn>
  update:      ReturnType<typeof vi.fn>
  delete:      ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
  query: {
    paymentAccounts:  { findFirst: ReturnType<typeof vi.fn> }
    financeGroups:    { findFirst: ReturnType<typeof vi.fn> }
    paymentProviders: { findFirst: ReturnType<typeof vi.fn> }
  }
}

const TENANT_A    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TENANT_B    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ACCOUNT_ID  = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const GROUP_ID    = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const PROVIDER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

const mockAccount = {
  id:                ACCOUNT_ID,
  tenantId:          TENANT_A,
  financeGroupId:    GROUP_ID,
  paymentProviderId: PROVIDER_ID,
  name:              'Test Hesap',
  accountNumber:     'TR330006100519786457841326',
  environment:       'production' as const,
  status:            'active' as const,
  dailyLimit:        '50000.00',
  dailyUsed:         '0.00',
  lastResetAt:       null,
  createdAt:         new Date('2026-01-01T00:00:00Z'),
  updatedAt:         new Date('2026-01-01T00:00:00Z'),
}

const createInput = {
  name:              'Test Hesap',
  accountNumber:     'TR330006100519786457841326',
  paymentProviderId: PROVIDER_ID,
  financeGroupId:    GROUP_ID,
  environment:       'production' as const,
  dailyLimit:        '50000.00',
}

beforeEach(() => {
  vi.clearAllMocks()
})

// --- createAccount ---

describe('paymentAccountService.createAccount', () => {
  it('başarılı oluşturma → hesap döner, dailyUsed=0', async () => {
    mockDb.query.financeGroups.findFirst.mockResolvedValueOnce({ id: GROUP_ID })
    mockDb.query.paymentProviders.findFirst.mockResolvedValueOnce({ id: PROVIDER_ID })
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockAccount]),
      }),
    })

    const result = await paymentAccountService.createAccount(TENANT_A, createInput)
    expect(result.name).toBe('Test Hesap')
    expect(result.dailyUsed).toBe('0.00')
  })

  it('23505 constraint → 409 PAYMENT_ACCOUNT_CONFLICT', async () => {
    mockDb.query.financeGroups.findFirst.mockResolvedValueOnce({ id: GROUP_ID })
    mockDb.query.paymentProviders.findFirst.mockResolvedValueOnce({ id: PROVIDER_ID })
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue({ code: '23505' }),
      }),
    })

    await expect(
      paymentAccountService.createAccount(TENANT_A, createInput)
    ).rejects.toMatchObject({ code: 'PAYMENT_ACCOUNT_CONFLICT', statusCode: 409 })
  })

  it('bilinmeyen finans grubu → 404 NOT_FOUND', async () => {
    mockDb.query.financeGroups.findFirst.mockResolvedValueOnce(undefined)
    mockDb.query.paymentProviders.findFirst.mockResolvedValueOnce({ id: PROVIDER_ID })

    await expect(
      paymentAccountService.createAccount(TENANT_A, createInput)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('bilinmeyen sağlayıcı → 404 NOT_FOUND', async () => {
    mockDb.query.financeGroups.findFirst.mockResolvedValueOnce({ id: GROUP_ID })
    mockDb.query.paymentProviders.findFirst.mockResolvedValueOnce(undefined)

    await expect(
      paymentAccountService.createAccount(TENANT_A, createInput)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

// --- listAccounts ---

describe('paymentAccountService.listAccounts', () => {
  const makeTx = (count: number, rows: unknown[]) => ({
    select: vi.fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count }]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(rows),
              }),
            }),
          }),
        }),
      }),
  })

  it('filtresiz liste → { data, meta }', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn(makeTx(1, [mockAccount]))
    )
    const result = await paymentAccountService.listAccounts(TENANT_A, {}, 1, 20)
    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
  })

  it('financeGroupId filtresi → tenant izolasyonu korunur', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn(makeTx(1, [mockAccount]))
    )
    const result = await paymentAccountService.listAccounts(TENANT_A, { financeGroupId: GROUP_ID }, 1, 20)
    expect(result.data).toHaveLength(1)
  })

  it('status=inactive filtresi → yalnızca inaktif hesaplar', async () => {
    const inactive = { ...mockAccount, status: 'inactive' as const }
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn(makeTx(1, [inactive]))
    )
    const result = await paymentAccountService.listAccounts(TENANT_A, { status: 'inactive' }, 1, 20)
    expect(result.data[0]!.status).toBe('inactive')
  })

  it('page > totalPages → safePage = totalPages', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn(makeTx(5, [mockAccount]))
    )
    // 5 kayıt, limit=20 → 1 sayfa; page=99 → safePage=1
    const result = await paymentAccountService.listAccounts(TENANT_A, {}, 99, 20)
    expect(result.meta.page).toBe(1)
  })

  it('boş sonuç → data: [], meta.total: 0', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn(makeTx(0, []))
    )
    const result = await paymentAccountService.listAccounts(TENANT_A, {}, 1, 20)
    expect(result.data).toHaveLength(0)
    expect(result.meta.total).toBe(0)
  })
})

// --- getAccount ---

describe('paymentAccountService.getAccount', () => {
  it('mevcut hesap → döner', async () => {
    mockDb.query.paymentAccounts.findFirst.mockResolvedValueOnce(mockAccount)
    const result = await paymentAccountService.getAccount(TENANT_A, ACCOUNT_ID)
    expect(result.id).toBe(ACCOUNT_ID)
  })

  it('mevcut olmayan → 404 NOT_FOUND', async () => {
    mockDb.query.paymentAccounts.findFirst.mockResolvedValueOnce(undefined)
    await expect(
      paymentAccountService.getAccount(TENANT_A, ACCOUNT_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('başka tenant → 404 NOT_FOUND', async () => {
    mockDb.query.paymentAccounts.findFirst.mockResolvedValueOnce(undefined)
    await expect(
      paymentAccountService.getAccount(TENANT_B, ACCOUNT_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

// --- updateAccount ---

describe('paymentAccountService.updateAccount', () => {
  it('başarılı güncelleme → güncellenmiş hesap döner', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...mockAccount, name: 'Yeni Ad' }]),
        }),
      }),
    })

    const result = await paymentAccountService.updateAccount(TENANT_A, ACCOUNT_ID, { name: 'Yeni Ad' })
    expect(result.name).toBe('Yeni Ad')
  })

  it('mevcut olmayan → 404 NOT_FOUND', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    await expect(
      paymentAccountService.updateAccount(TENANT_A, ACCOUNT_ID, { name: 'Yeni Ad' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('boş payload → 400 VALIDATION_ERROR', async () => {
    await expect(
      paymentAccountService.updateAccount(TENANT_A, ACCOUNT_ID, {})
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })
  })
})

// --- updateStatus ---

describe('paymentAccountService.updateStatus', () => {
  it('active → inactive', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...mockAccount, status: 'inactive' }]),
        }),
      }),
    })

    const result = await paymentAccountService.updateStatus(TENANT_A, ACCOUNT_ID, { status: 'inactive' })
    expect(result.status).toBe('inactive')
  })

  it('inactive → active', async () => {
    const inactiveAccount = { ...mockAccount, status: 'inactive' as const }
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...inactiveAccount, status: 'active' }]),
        }),
      }),
    })

    const result = await paymentAccountService.updateStatus(TENANT_A, ACCOUNT_ID, { status: 'active' })
    expect(result.status).toBe('active')
  })

  it('mevcut olmayan → 404 NOT_FOUND', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })
    await expect(
      paymentAccountService.updateStatus(TENANT_A, ACCOUNT_ID, { status: 'inactive' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

// --- updateDailyLimit ---

describe('paymentAccountService.updateDailyLimit', () => {
  it('başarılı limit güncellemesi → dailyUsed değişmez', async () => {
    const accountWithUsed = { ...mockAccount, dailyUsed: '12345.67' }
    mockDb.query.paymentAccounts.findFirst.mockResolvedValueOnce(accountWithUsed)
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...accountWithUsed, dailyLimit: '99999.99' }]),
        }),
      }),
    })

    const result = await paymentAccountService.updateDailyLimit(TENANT_A, ACCOUNT_ID, { dailyLimit: '99999.99' })
    expect(result.dailyLimit).toBe('99999.99')
    // dailyUsed sıfırlanmadı
    expect(result.dailyUsed).toBe('12345.67')
  })

  it('mevcut olmayan → 404 NOT_FOUND', async () => {
    mockDb.query.paymentAccounts.findFirst.mockResolvedValueOnce(undefined)
    await expect(
      paymentAccountService.updateDailyLimit(TENANT_A, ACCOUNT_ID, { dailyLimit: '99999.99' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('yeni limit < dailyUsed → 409 INVALID_DAILY_LIMIT', async () => {
    mockDb.query.paymentAccounts.findFirst.mockResolvedValueOnce({ ...mockAccount, dailyUsed: '30000.00' })
    await expect(
      paymentAccountService.updateDailyLimit(TENANT_A, ACCOUNT_ID, { dailyLimit: '10000.00' })
    ).rejects.toMatchObject({ code: 'INVALID_DAILY_LIMIT', statusCode: 409 })
  })
})
