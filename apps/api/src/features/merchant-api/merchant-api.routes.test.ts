import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// pg-boss mock — boss.send çağrısı için
vi.mock('pg-boss', () => {
  const Boss = vi.fn().mockImplementation(() => ({
    start:    vi.fn().mockResolvedValue(undefined),
    stop:     vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue(undefined),
    work:     vi.fn().mockResolvedValue(undefined),
    send:     vi.fn().mockResolvedValue('job-id'),
  }))
  return { PgBoss: Boss }
})

vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:         { findFirst: vi.fn() },
      sessions:        { findFirst: vi.fn() },
      merchantApiKeys: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
  auditLogs:       {},
  merchantApiKeys: {},
  merchants:       {},
  transactions:    {},
  users:           {},
  sessions:        {},
  tenants:         {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('./merchant-api.service.js', () => ({
  merchantApiService: {
    initiateDeposit:   vi.fn(),
    confirmDeposit:    vi.fn(),
    requestWithdrawal: vi.fn(),
    getTransaction:    vi.fn(),
    listTransactions:  vi.fn(),
    getPaymentMethods: vi.fn(),
    getExchangeRates:  vi.fn(),
  },
}))

vi.mock('../../middleware/merchant-hmac.js', () => ({
  merchantAuth: vi.fn(),
}))

import { merchantApiService } from './merchant-api.service.js'
import { merchantAuth } from '../../middleware/merchant-hmac.js'
import { buildApp } from '../../app.js'

const mockService      = merchantApiService as unknown as {
  initiateDeposit:   ReturnType<typeof vi.fn>
  confirmDeposit:    ReturnType<typeof vi.fn>
  requestWithdrawal: ReturnType<typeof vi.fn>
  getTransaction:    ReturnType<typeof vi.fn>
  listTransactions:  ReturnType<typeof vi.fn>
  getPaymentMethods: ReturnType<typeof vi.fn>
  getExchangeRates:  ReturnType<typeof vi.fn>
}
const mockMerchantAuth = merchantAuth as unknown as ReturnType<typeof vi.fn>

const mockMerchant = {
  id:        'mid-1',
  tenantId:  'tid-1',
  status:    'active',
  isSandbox: true,
}

const TX_ID     = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TX_ID_2   = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const EXPIRES_AT = '2026-03-22T12:30:00.000Z'

const depositResponse = {
  txId:           TX_ID,
  status:         'STARTED' as const,
  depositAddress: 'TR33000000000000000000000',
  accountName:    'Test Hesap',
  amount:         '500.00',
  currency:       'TRY',
  expiresAt:      EXPIRES_AT,
}

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  // boss plugin test'te kaydedilmiyor — fake decorator ekle
  const mockBoss = {
    send:     vi.fn().mockResolvedValue('job-id'),
    work:     vi.fn().mockResolvedValue(undefined),
    start:    vi.fn().mockResolvedValue(undefined),
    stop:     vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue(undefined),
  }
  app.decorate('boss', mockBoss)
})

afterAll(async () => {
  await app.close()
})

describe('POST /merchant/v1/deposit/initiate', () => {
  it('geçerli istek → 201 + txId/depositAddress/status=STARTED/expiresAt', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })
    mockService.initiateDeposit.mockResolvedValueOnce(depositResponse)

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/initiate',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ externalUserId: 'player-1', amount: '500.00', currency: 'TRY' }),
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.txId).toBe(TX_ID)
    expect(body.status).toBe('STARTED')
    expect(body.depositAddress).toBe('TR33000000000000000000000')
    expect(body.expiresAt).toBe(EXPIRES_AT)
  })

  it('geçersiz API key (merchantAuth 401 atar) → 401', async () => {
    const { AppError } = await import('../../errors/app-error.js')
    mockMerchantAuth.mockImplementationOnce(async () => {
      throw new AppError('INVALID_API_KEY', 'Geçersiz veya pasif API key.', 401)
    })

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/initiate',
      headers: { 'x-api-key': 'bad-key', 'content-type': 'application/json' },
      body: JSON.stringify({ externalUserId: 'player-1', amount: '500.00', currency: 'TRY' }),
    })

    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('INVALID_API_KEY')
  })

  it('ROUTING_FAILED → 422', async () => {
    const { AppError } = await import('../../errors/app-error.js')
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })
    mockService.initiateDeposit.mockRejectedValueOnce(
      new AppError('ROUTING_FAILED', 'Merchant finans grubuna atanmamış.', 422)
    )

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/initiate',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ externalUserId: 'player-1', amount: '500.00', currency: 'TRY' }),
    })

    expect(res.statusCode).toBe(422)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('ROUTING_FAILED')
  })

  it('STALE_EXCHANGE_RATE → 422', async () => {
    const { AppError } = await import('../../errors/app-error.js')
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })
    mockService.initiateDeposit.mockRejectedValueOnce(
      new AppError('STALE_EXCHANGE_RATE', 'Güncel kur bilgisi bulunamadı.', 422)
    )

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/initiate',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ externalUserId: 'player-1', amount: '500.00', currency: 'TRY' }),
    })

    expect(res.statusCode).toBe(422)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('STALE_EXCHANGE_RATE')
  })

  it('NO_AVAILABLE_ACCOUNT → 422', async () => {
    const { AppError } = await import('../../errors/app-error.js')
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })
    mockService.initiateDeposit.mockRejectedValueOnce(
      new AppError('NO_AVAILABLE_ACCOUNT', 'Uygun ödeme hesabı bulunamadı.', 422)
    )

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/initiate',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ externalUserId: 'player-1', amount: '500.00', currency: 'TRY' }),
    })

    expect(res.statusCode).toBe(422)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('NO_AVAILABLE_ACCOUNT')
  })

  it('externalUserId eksik → 400 validation error', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/initiate',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: '500.00', currency: 'TRY' }),
    })

    expect(res.statusCode).toBe(400)
  })

  it('geçersiz amount formatı → 400 validation error', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/initiate',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ externalUserId: 'p-1', amount: 'abc', currency: 'TRY' }),
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('POST /merchant/v1/deposit/confirm', () => {
  it('geçerli STARTED deposit → 200 + status=PENDING', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })
    mockService.confirmDeposit.mockResolvedValueOnce({ txId: TX_ID, status: 'PENDING' as const })

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/confirm',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ txId: TX_ID }),
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.txId).toBe(TX_ID)
    expect(body.status).toBe('PENDING')
  })

  it('deposit bulunamadı → 404', async () => {
    const { AppError } = await import('../../errors/app-error.js')
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })
    mockService.confirmDeposit.mockRejectedValueOnce(
      new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
    )

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/confirm',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ txId: TX_ID }),
    })

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND')
  })

  it('deposit STARTED değil → 409 INVALID_STATE_TRANSITION', async () => {
    const { AppError } = await import('../../errors/app-error.js')
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })
    mockService.confirmDeposit.mockRejectedValueOnce(
      new AppError('INVALID_STATE_TRANSITION', 'Yalnızca STARTED deposit confirm edilebilir.', 409)
    )

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/confirm',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ txId: TX_ID }),
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('INVALID_STATE_TRANSITION')
  })

  it('txId geçersiz UUID → 400', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/deposit/confirm',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ txId: 'not-a-uuid' }),
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('POST /merchant/v1/withdrawal/request', () => {
  it('geçerli istek → 201 + txId + status=PENDING', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })
    mockService.requestWithdrawal.mockResolvedValueOnce({ txId: TX_ID_2, status: 'PENDING' as const, withdrawalAddress: 'TR330006100519786457841326', withdrawalAccountName: 'Ali Veli' })

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/withdrawal/request',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({
        externalUserId:        'player-1',
        amount:                '250.00',
        currency:              'TRY',
        paymentMethod:         'IBAN',
        withdrawalAddress:     'TR330006100519786457841326',
        withdrawalAccountName: 'Ali Veli',
      }),
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.txId).toBe(TX_ID_2)
    expect(body.status).toBe('PENDING')
  })

  it('amount formatı geçersiz → 400', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/withdrawal/request',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({
        externalUserId:        'player-1',
        amount:                'bad-amount',
        currency:              'TRY',
        paymentMethod:         'IBAN',
        withdrawalAddress:     'TR330006100519786457841326',
        withdrawalAccountName: 'Ali Veli',
      }),
    })

    expect(res.statusCode).toBe(400)
  })

  it('paymentMethod eksik → 400', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => {
      req.merchant = mockMerchant
    })

    const res = await app.inject({
      method:  'POST',
      url:     '/merchant/v1/withdrawal/request',
      headers: { 'x-api-key': 'key_abc:sk_xyz', 'content-type': 'application/json' },
      body: JSON.stringify({ externalUserId: 'player-1', amount: '250.00', currency: 'TRY' }),
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /merchant/v1/transactions/:txId', () => {
  const txItem = {
    txId:           TX_ID,
    status:         'PENDING' as const,
    type:           'deposit' as const,
    amount:         '500.00',
    currency:       'TRY',
    externalUserId: 'user-123',
    paymentMethod:  null,
    createdAt:      '2026-03-22T10:00:00.000Z',
    updatedAt:      '2026-03-22T10:01:00.000Z',
  }

  it('kendi işlemi → 200 + data', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.getTransaction.mockResolvedValue({ data: txItem })

    const res = await app.inject({
      method:  'GET',
      url:     `/merchant/v1/transactions/${TX_ID}`,
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.txId).toBe(TX_ID)
    expect(body.data.status).toBe('PENDING')
    expect(body.data.currency).toBe('TRY')
  })

  it('bulunamadı → 404', async () => {
    const { AppError } = await import('../../errors/app-error.js')
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.getTransaction.mockRejectedValue(new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404))

    const res = await app.inject({
      method:  'GET',
      url:     `/merchant/v1/transactions/${TX_ID}`,
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND')
  })

  it('geçersiz UUID → 400', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/transactions/not-a-uuid',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /merchant/v1/transactions', () => {
  const txItem = {
    txId:           TX_ID,
    status:         'PENDING' as const,
    type:           'deposit' as const,
    amount:         '500.00',
    currency:       'TRY',
    externalUserId: 'user-123',
    paymentMethod:  null,
    createdAt:      '2026-03-22T10:00:00.000Z',
    updatedAt:      '2026-03-22T10:01:00.000Z',
  }
  const listResponse = {
    data: [txItem],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  }

  it('filtre yok → 200 + { data, meta }', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.listTransactions.mockResolvedValue(listResponse)

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/transactions',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toHaveLength(1)
    expect(body.meta.total).toBe(1)
    expect(body.meta.page).toBe(1)
    expect(body.meta.limit).toBe(20)
    expect(body.meta.totalPages).toBe(1)
  })

  it('status filtresi → 200', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.listTransactions.mockResolvedValue(listResponse)

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/transactions?status=PENDING',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).data).toHaveLength(1)
  })

  it('dateFrom + dateTo → 200', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.listTransactions.mockResolvedValue(listResponse)

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/transactions?dateFrom=2026-03-01T00:00:00Z&dateTo=2026-03-31T23:59:59Z',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('geçersiz status → 400', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/transactions?status=INVALID_STATUS',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe('GET /merchant/v1/payment-methods', () => {
  it('finans grubu var → 200 + { data: [{ name }] }', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.getPaymentMethods.mockResolvedValue({ data: [{ name: 'IBAN' }, { name: 'Papara' }] })

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/payment-methods',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data).toHaveLength(2)
    expect(body.data[0].name).toBe('IBAN')
  })

  it('finans grubu yok → 200 + { data: [] }', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.getPaymentMethods.mockResolvedValue({ data: [] })

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/payment-methods',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).data).toHaveLength(0)
  })
})

describe('GET /merchant/v1/exchange-rates', () => {
  const freshRate = {
    fromCurrency: 'USD',
    toCurrency:   'TRY',
    rate:         '32.50',
    source:       'binance',
    fetchedAt:    new Date().toISOString(),
    stale:        false,
  }
  const staleRate = {
    fromCurrency: 'EUR',
    toCurrency:   'TRY',
    rate:         '35.00',
    source:       'manual',
    fetchedAt:    new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    stale:        true,
  }

  it('güncel kur → 200 + stale: false', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.getExchangeRates.mockResolvedValue({ data: [freshRate] })

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/exchange-rates',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data[0].stale).toBe(false)
    expect(body.data[0].fromCurrency).toBe('USD')
  })

  it('eski kur → 200 + stale: true', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.getExchangeRates.mockResolvedValue({ data: [staleRate] })

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/exchange-rates',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data[0].stale).toBe(true)
  })

  it('kur yok → 200 + { data: [] }', async () => {
    mockMerchantAuth.mockImplementationOnce(async (req: any) => { req.merchant = mockMerchant })
    mockService.getExchangeRates.mockResolvedValue({ data: [] })

    const res = await app.inject({
      method:  'GET',
      url:     '/merchant/v1/exchange-rates',
      headers: { 'x-api-key': 'key_abc:sk_xyz' },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).data).toHaveLength(0)
  })
})

