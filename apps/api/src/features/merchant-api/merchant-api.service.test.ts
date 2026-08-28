import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      transactions:  { findFirst: vi.fn(), findMany: vi.fn() },
      merchants:     { findFirst: vi.fn() },
      exchangeRates: { findMany: vi.fn() },
    },
    insert:  vi.fn(),
    update:  vi.fn(),
    $count:  vi.fn(),
    select:  vi.fn(),
  },
  merchants:        {},
  transactions:     {},
  paymentAccounts:  {},
  paymentProviders: {},
  eq:  vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((col, val) => ({ col, val, gte: true })),
  lte: vi.fn((col, val) => ({ col, val, lte: true })),
}))

vi.mock('../transactions/transaction.service.js', () => ({
  transactionService: {
    initiateTransaction: vi.fn(),
    confirmDeposit:      vi.fn(),
    requestWithdrawal:   vi.fn(),
  },
}))

vi.mock('../blocked-players/blocked-player.service.js', () => ({
  blockedPlayerService: {
    checkPlayerBlocked: vi.fn(),
  },
}))

import { db } from '@panel/db'
import { transactionService } from '../transactions/transaction.service.js'
import { blockedPlayerService } from '../blocked-players/blocked-player.service.js'
import { merchantApiService } from './merchant-api.service.js'
import { AppError } from '../../errors/app-error.js'

const mockTxQuery       = (db.query as any).transactions  as { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
const mockMerchantQuery = (db.query as any).merchants     as { findFirst: ReturnType<typeof vi.fn> }
const mockRatesQuery    = (db.query as any).exchangeRates as { findMany: ReturnType<typeof vi.fn> }
const mockCount         = db.$count  as ReturnType<typeof vi.fn>
const mockSelect        = db.select  as ReturnType<typeof vi.fn>

const mockInitiate  = transactionService.initiateTransaction as ReturnType<typeof vi.fn>
const mockConfirm   = transactionService.confirmDeposit      as ReturnType<typeof vi.fn>
const mockWithdraw  = transactionService.requestWithdrawal   as ReturnType<typeof vi.fn>
const mockBlocked   = blockedPlayerService.checkPlayerBlocked as ReturnType<typeof vi.fn>

const TENANT_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MERCHANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const TX_ID       = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const baseTx = {
  id:             TX_ID,
  tenantId:       TENANT_ID,
  merchantId:     MERCHANT_ID,
  status:         'PENDING',
  type:           'deposit' as const,
  amount:         '500.00',
  currency:       'TRY',
  externalUserId: 'player-1',
  paymentMethod:  null,
  createdAt:      new Date('2026-01-01T10:00:00Z'),
  updatedAt:      new Date('2026-01-01T10:01:00Z'),
}

beforeEach(() => {
  vi.resetAllMocks()
  mockBlocked.mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------

describe('merchantApiService.initiateDeposit', () => {
  it('blocked oyuncu → AppError fırlatır (checkPlayerBlocked propagation)', async () => {
    mockBlocked.mockRejectedValueOnce(new AppError('PLAYER_BLOCKED', 'Engellenmiş oyuncu', 403))

    await expect(
      merchantApiService.initiateDeposit({
        tenantId:   TENANT_ID,
        merchantId: MERCHANT_ID,
        input: { externalUserId: 'player-1', amount: '100', currency: 'TRY', paymentMethod: 'EFT' },
      })
    ).rejects.toMatchObject({ code: 'PLAYER_BLOCKED' })
  })

  it('başarılı işlemde STARTED yanıtı döner', async () => {
    const fakeTx = {
      id:                  TX_ID,
      depositAddress:      'TR123',
      amount:              '500.00',
      currency:            'TRY',
      startedExpiresAt:    new Date('2026-01-01T10:15:00Z'),
    }
    mockInitiate.mockResolvedValue(fakeTx)

    const result = await merchantApiService.initiateDeposit({
      tenantId:   TENANT_ID,
      merchantId: MERCHANT_ID,
      input: { externalUserId: 'player-1', amount: '500', currency: 'TRY', paymentMethod: 'EFT' },
    })

    expect(result.status).toBe('STARTED')
    expect(result.txId).toBe(TX_ID)
    expect(result.depositAddress).toBe('TR123')
    expect(result.expiresAt).toBe('2026-01-01T10:15:00.000Z')
    expect(mockBlocked).toHaveBeenCalledWith(MERCHANT_ID, 'player-1')
  })
})

// ---------------------------------------------------------------------------

describe('merchantApiService.confirmDeposit', () => {
  it('PENDING durumu ve txId döner', async () => {
    mockConfirm.mockResolvedValue({ id: TX_ID })

    const result = await merchantApiService.confirmDeposit({
      tenantId: TENANT_ID, merchantId: MERCHANT_ID, txId: TX_ID,
    })

    expect(result).toEqual({ txId: TX_ID, status: 'PENDING' })
  })
})

// ---------------------------------------------------------------------------

describe('merchantApiService.requestWithdrawal', () => {
  it('blocked oyuncu → hata propagate eder', async () => {
    mockBlocked.mockRejectedValueOnce(new AppError('PLAYER_BLOCKED', 'Engellenmiş', 403))

    await expect(
      merchantApiService.requestWithdrawal({
        tenantId:   TENANT_ID,
        merchantId: MERCHANT_ID,
        input: { externalUserId: 'player-1', amount: '200', currency: 'TRY', paymentMethod: 'EFT', withdrawalAddress: 'TR330006100519786457841326', withdrawalAccountName: 'Ad Soyad' },
      })
    ).rejects.toMatchObject({ code: 'PLAYER_BLOCKED' })
    expect(mockWithdraw).not.toHaveBeenCalled()
  })

  it('başarılı işlemde PENDING döner', async () => {
    mockWithdraw.mockResolvedValue({ id: TX_ID, withdrawalAddress: 'TR330006100519786457841326', withdrawalAccountName: 'Ad Soyad' })

    const result = await merchantApiService.requestWithdrawal({
      tenantId:   TENANT_ID,
      merchantId: MERCHANT_ID,
      input: { externalUserId: 'player-1', amount: '200', currency: 'TRY', paymentMethod: 'EFT', withdrawalAddress: 'TR330006100519786457841326', withdrawalAccountName: 'Ad Soyad' },
    })

    expect(result).toEqual({ txId: TX_ID, status: 'PENDING', withdrawalAddress: 'TR330006100519786457841326', withdrawalAccountName: 'Ad Soyad' })
  })
})

// ---------------------------------------------------------------------------

describe('merchantApiService.getTransaction', () => {
  it('bulunamayan işlem → 404 NOT_FOUND', async () => {
    mockTxQuery.findFirst.mockResolvedValue(null)

    await expect(
      merchantApiService.getTransaction({ tenantId: TENANT_ID, merchantId: MERCHANT_ID, txId: TX_ID })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('bulunan işlem → serialize edilmiş data döner', async () => {
    mockTxQuery.findFirst.mockResolvedValue(baseTx)

    const result = await merchantApiService.getTransaction({
      tenantId: TENANT_ID, merchantId: MERCHANT_ID, txId: TX_ID,
    })

    expect(result.data.txId).toBe(TX_ID)
    expect(result.data.status).toBe('PENDING')
    expect(result.data.createdAt).toBe('2026-01-01T10:00:00.000Z')
    expect(result.data.updatedAt).toBe('2026-01-01T10:01:00.000Z')
    expect(result.data.paymentMethod).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('merchantApiService.listTransactions', () => {
  it('sonuç yoksa boş dizi ve doğru meta döner', async () => {
    mockTxQuery.findMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    const result = await merchantApiService.listTransactions({
      tenantId: TENANT_ID, merchantId: MERCHANT_ID,
      page: 1, limit: 20,
    })

    expect(result.data).toHaveLength(0)
    expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 })
  })

  it('toplam 45 kayıt / limit 20 → totalPages 3', async () => {
    mockTxQuery.findMany.mockResolvedValue([baseTx])
    mockCount.mockResolvedValue(45)

    const result = await merchantApiService.listTransactions({
      tenantId: TENANT_ID, merchantId: MERCHANT_ID,
      page: 2, limit: 20,
    })

    expect(result.meta.totalPages).toBe(3)
    expect(result.meta.page).toBe(2)
  })

  it('serialize: createdAt/updatedAt ISO string, paymentMethod null→null', async () => {
    mockTxQuery.findMany.mockResolvedValue([baseTx])
    mockCount.mockResolvedValue(1)

    const result = await merchantApiService.listTransactions({
      tenantId: TENANT_ID, merchantId: MERCHANT_ID,
      page: 1, limit: 20,
    })

    const row = result.data[0]!
    expect(row.createdAt).toBe('2026-01-01T10:00:00.000Z')
    expect(row.paymentMethod).toBeNull()
    expect(row.txId).toBe(TX_ID)
  })
})

// ---------------------------------------------------------------------------

describe('merchantApiService.getPaymentMethods', () => {
  it('merchant yok → boş dizi', async () => {
    mockMerchantQuery.findFirst.mockResolvedValue(null)

    const result = await merchantApiService.getPaymentMethods({
      tenantId: TENANT_ID, merchantId: MERCHANT_ID,
    })

    expect(result.data).toEqual([])
  })

  it('merchant var ama financeGroupId yok → boş dizi', async () => {
    mockMerchantQuery.findFirst.mockResolvedValue({ id: MERCHANT_ID, financeGroupId: null, isSandbox: false })

    const result = await merchantApiService.getPaymentMethods({
      tenantId: TENANT_ID, merchantId: MERCHANT_ID,
    })

    expect(result.data).toEqual([])
  })

  it('tekrar eden provider adları deduplicate edilir, alfabetik sıralanır', async () => {
    mockMerchantQuery.findFirst.mockResolvedValue({
      id: MERCHANT_ID, financeGroupId: 'fg-1', isSandbox: false, tenantId: TENANT_ID,
    })

    // db.select().from().innerJoin().where() zinciri
    const mockWhere = vi.fn().mockResolvedValue([
      { name: 'Papara' },
      { name: 'EFT' },
      { name: 'Papara' }, // duplicate
    ])
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere })
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await merchantApiService.getPaymentMethods({
      tenantId: TENANT_ID, merchantId: MERCHANT_ID,
    })

    expect(result.data).toEqual([{ name: 'EFT' }, { name: 'Papara' }])
  })

  it('isSandbox=true → environment=sandbox olarak sorgulanır', async () => {
    mockMerchantQuery.findFirst.mockResolvedValue({
      id: MERCHANT_ID, financeGroupId: 'fg-1', isSandbox: true, tenantId: TENANT_ID,
    })

    const mockWhere = vi.fn().mockResolvedValue([{ name: 'Test' }])
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere })
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin })
    mockSelect.mockReturnValue({ from: mockFrom })

    const result = await merchantApiService.getPaymentMethods({
      tenantId: TENANT_ID, merchantId: MERCHANT_ID,
    })

    expect(result.data).toEqual([{ name: 'Test' }])
    // eq mock çağrıları içinde 'sandbox' geçmeli
    const { eq } = await import('@panel/db')
    const eqCalls = (eq as ReturnType<typeof vi.fn>).mock.calls
    const hasSandbox = eqCalls.some(([, val]) => val === 'sandbox')
    expect(hasSandbox).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('merchantApiService.getExchangeRates', () => {
  it('boş tablo → boş dizi döner', async () => {
    mockRatesQuery.findMany.mockResolvedValue([])

    const result = await merchantApiService.getExchangeRates()

    expect(result.data).toEqual([])
  })

  it('aynı kur çifti için en son kayıt döner (deduplicate)', async () => {
    const older = {
      fromCurrency: 'EUR', toCurrency: 'TRY', rate: '35.00',
      source: 'manual', fetchedAt: new Date('2026-01-01T09:00:00Z'),
    }
    const newer = {
      fromCurrency: 'EUR', toCurrency: 'TRY', rate: '36.00',
      source: 'api', fetchedAt: new Date('2026-01-01T10:00:00Z'),
    }
    // findMany desc sıralı → newer önce gelir
    mockRatesQuery.findMany.mockResolvedValue([newer, older])

    const result = await merchantApiService.getExchangeRates()

    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.rate).toBe('36.00')
    expect(result.data[0]!.fetchedAt).toBe('2026-01-01T10:00:00.000Z')
  })

  it('farklı kur çiftleri ayrı ayrı döner', async () => {
    mockRatesQuery.findMany.mockResolvedValue([
      { fromCurrency: 'EUR', toCurrency: 'TRY', rate: '36.00', source: 'api', fetchedAt: new Date('2026-01-01T10:00:00Z') },
      { fromCurrency: 'USD', toCurrency: 'TRY', rate: '33.00', source: 'api', fetchedAt: new Date('2026-01-01T10:00:00Z') },
    ])

    const result = await merchantApiService.getExchangeRates()

    expect(result.data).toHaveLength(2)
  })

  it('stale flag: fetchedAt >15 dk önce ise stale=true', async () => {
    const fresh = new Date(Date.now() - 5 * 60 * 1000)   // 5 dk önce
    const stale = new Date(Date.now() - 20 * 60 * 1000)  // 20 dk önce

    mockRatesQuery.findMany.mockResolvedValue([
      { fromCurrency: 'EUR', toCurrency: 'TRY', rate: '36.00', source: 'api', fetchedAt: fresh },
      { fromCurrency: 'USD', toCurrency: 'TRY', rate: '33.00', source: 'api', fetchedAt: stale },
    ])

    const result = await merchantApiService.getExchangeRates()

    const eurEntry = result.data.find(r => r.fromCurrency === 'EUR')!
    const usdEntry = result.data.find(r => r.fromCurrency === 'USD')!
    expect(eurEntry.stale).toBe(false)
    expect(usdEntry.stale).toBe(true)
  })
})
