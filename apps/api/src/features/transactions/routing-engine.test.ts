import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      merchants:     { findFirst: vi.fn() },
      exchangeRates: { findFirst: vi.fn() },
      users:         { findMany: vi.fn().mockResolvedValue([]) },
    },
    transaction: vi.fn(),
    execute:     vi.fn(),
    insert:      vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
  paymentAccounts: {},
  merchants:       {},
  exchangeRates:   {},
  users:           {},
  notifications:   {},
  sql: vi.fn(),
  and: vi.fn((...args: unknown[]) => args),
  eq:  vi.fn((col, val) => ({ col, val })),
  gt:  vi.fn((col, val) => ({ col, val, gt: true })),
}))

import { db } from '@panel/db'
import { selectPaymentAccount } from './routing-engine.js'

const mockMerchantsQuery     = (db.query as any).merchants     as { findFirst: ReturnType<typeof vi.fn> }
const mockExchangeRatesQuery = (db.query as any).exchangeRates as { findFirst: ReturnType<typeof vi.fn> }
const mockUsersQuery         = (db.query as any).users         as { findMany: ReturnType<typeof vi.fn> }
const mockInsert             = db.insert as ReturnType<typeof vi.fn>
const mockTransaction        = db.transaction as ReturnType<typeof vi.fn>

const activeMerchant = {
  id:             'mid-1',
  tenantId:       'tid-1',
  financeGroupId: 'fgid-1',
  isSandbox:      true,
  status:         'active',
}

const freshRate = {
  id:        'eid-1',
  fetchedAt: new Date(),
}

const selectedAccount = {
  id:             'paid-1',
  account_number: 'TR33000000000000000000000',
}

const params = { tenantId: 'tid-1', merchantId: 'mid-1', amount: '500.00' }

describe('selectPaymentAccount (routing engine)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('başarı: uygun hesap bulunur, RouteResult döner', async () => {
    mockMerchantsQuery.findFirst.mockResolvedValueOnce(activeMerchant)
    mockExchangeRatesQuery.findFirst.mockResolvedValueOnce(freshRate)
    mockTransaction.mockImplementationOnce(async (fn: Function) => {
      const tx = {
        execute: vi.fn()
          .mockResolvedValueOnce([selectedAccount])  // SELECT (RowList, array-like)
          .mockResolvedValueOnce([]),                // UPDATE
      }
      return fn(tx)
    })

    const result = await selectPaymentAccount(params)
    expect(result).toEqual({
      paymentAccountId: 'paid-1',
      accountNumber:    'TR33000000000000000000000',
    })
  })

  it('ROUTING_FAILED: merchant financeGroupId yoksa 422', async () => {
    mockMerchantsQuery.findFirst.mockResolvedValueOnce({ ...activeMerchant, financeGroupId: null })

    await expect(selectPaymentAccount(params)).rejects.toMatchObject({
      code: 'ROUTING_FAILED',
      statusCode: 422,
    })
    expect(mockExchangeRatesQuery.findFirst).not.toHaveBeenCalled()
  })

  it('ROUTING_FAILED: merchant bulunamazsa 404', async () => {
    mockMerchantsQuery.findFirst.mockResolvedValueOnce(null)

    await expect(selectPaymentAccount(params)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })

  it('STALE_EXCHANGE_RATE: taze kur yoksa 422 ve bildirim gönderilir', async () => {
    const superAdmin = { id: 'admin-1', tenantId: 'tid-admin' }
    mockMerchantsQuery.findFirst.mockResolvedValueOnce(activeMerchant)
    mockExchangeRatesQuery.findFirst.mockResolvedValueOnce(null)
    mockUsersQuery.findMany.mockResolvedValueOnce([superAdmin])

    await expect(selectPaymentAccount(params)).rejects.toMatchObject({
      code: 'STALE_EXCHANGE_RATE',
      statusCode: 422,
    })
    expect(mockInsert).toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('STALE_EXCHANGE_RATE: super_admin yoksa bildirim gönderilmez', async () => {
    mockMerchantsQuery.findFirst.mockResolvedValueOnce(activeMerchant)
    mockExchangeRatesQuery.findFirst.mockResolvedValueOnce(null)
    mockUsersQuery.findMany.mockResolvedValueOnce([]) // boş liste

    await expect(selectPaymentAccount(params)).rejects.toMatchObject({
      code: 'STALE_EXCHANGE_RATE',
      statusCode: 422,
    })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('NO_AVAILABLE_ACCOUNT: SELECT boş sonuç → 422', async () => {
    mockMerchantsQuery.findFirst.mockResolvedValueOnce(activeMerchant)
    mockExchangeRatesQuery.findFirst.mockResolvedValueOnce(freshRate)
    mockTransaction.mockImplementationOnce(async (fn: Function) => {
      const tx = {
        execute: vi.fn().mockResolvedValueOnce([]),  // boş SELECT (RowList)
      }
      return fn(tx)
    })

    await expect(selectPaymentAccount(params)).rejects.toMatchObject({
      code: 'NO_AVAILABLE_ACCOUNT',
      statusCode: 422,
    })
  })

  it('eşzamanlılık: SKIP LOCKED nedeniyle ilk hesap kilitliyse ikinci hesap seçilir', async () => {
    const secondAccount = { id: 'paid-2', account_number: 'TR44...' }
    mockMerchantsQuery.findFirst.mockResolvedValueOnce(activeMerchant)
    mockExchangeRatesQuery.findFirst.mockResolvedValueOnce(freshRate)
    mockTransaction.mockImplementationOnce(async (fn: Function) => {
      const tx = {
        execute: vi.fn()
          .mockResolvedValueOnce([secondAccount])  // ilk kilitli, ikinci döndü
          .mockResolvedValueOnce([]),
      }
      return fn(tx)
    })

    const result = await selectPaymentAccount(params)
    expect(result.paymentAccountId).toBe('paid-2')
  })
})
