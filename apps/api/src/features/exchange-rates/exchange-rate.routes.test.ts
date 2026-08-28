import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const { mockHistoryOffset, mockHistorySelect } = vi.hoisted(() => {
  const mockHistoryOffset  = vi.fn().mockResolvedValue([])
  const mockHistoryLimit   = vi.fn(() => ({ offset: mockHistoryOffset }))
  const mockHistoryOrderBy = vi.fn(() => ({ limit: mockHistoryLimit }))
  const mockHistoryWhere   = vi.fn(() => ({ orderBy: mockHistoryOrderBy }))
  const mockHistoryFrom    = vi.fn(() => ({ where: mockHistoryWhere }))
  const mockHistorySelect  = vi.fn(() => ({ from: mockHistoryFrom }))
  return { mockHistoryOffset, mockHistorySelect }
})

vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:       { findFirst: vi.fn() },
      sessions:      { findFirst: vi.fn() },
      exchangeRates: { findFirst: vi.fn(), findMany: vi.fn() },
      users:         { findMany: vi.fn().mockResolvedValue([]) },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    select: mockHistorySelect,
  },
  exchangeRates: {},
  notifications: {},
  users:         {},
  sessions:      {},
  tenants:       {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args.filter(Boolean)),
  gt:     vi.fn((col, val) => ({ col, val })),
  gte:    vi.fn((col, val) => ({ col, val })),
  lte:    vi.fn((col, val) => ({ col, val })),
  isNull: vi.fn((col) => ({ col })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
  desc:   vi.fn((col) => ({ col, direction: 'desc' })),
}))

vi.mock('./exchange-rate.service.js', () => ({
  exchangeRateService: {
    insertManual:     vi.fn(),
    syncFromExternal: vi.fn(),
    getCurrent:       vi.fn(),
    isStale:          vi.fn(),
  },
}))

import { db } from '@panel/db'
import { exchangeRateService } from './exchange-rate.service.js'
import { buildApp } from '../../app.js'

const mockService = exchangeRateService as unknown as {
  insertManual:     ReturnType<typeof vi.fn>
  syncFromExternal: ReturnType<typeof vi.fn>
  getCurrent:       ReturnType<typeof vi.fn>
  isStale:          ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID    = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const RATE_ID    = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

const now = new Date('2026-03-23T10:00:00Z')
const sampleRate = {
  id:           RATE_ID,
  fromCurrency: 'USD',
  toCurrency:   'TRY',
  rate:         '32.50000000',
  source:       'manual',
  fetchedAt:    now,
  createdAt:    now,
}

function makeToken(app: FastifyInstance, role: string) {
  return app.jwt.sign({ userId: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, role })
}

describe('Exchange Rate Routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockDbQuery.tenants.findFirst.mockResolvedValue(activeTenant)
    mockDbQuery.sessions.findFirst.mockResolvedValue(activeSession)
  })

  // GET /current
  describe('GET /api/v1/exchange-rates/current', () => {
    it('200: authenticate kullanıcıya güncel kurları döner', async () => {
      mockService.getCurrent.mockResolvedValueOnce([sampleRate])

      const token = makeToken(app, 'finans')
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/exchange-rates/current',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].fromCurrency).toBe('USD')
      expect(body.data[0].toCurrency).toBe('TRY')
      expect(body.meta.total).toBe(1)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/exchange-rates/current' })
      expect(res.statusCode).toBe(401)
    })
  })

  // POST / — manuel kur girişi
  describe('POST /api/v1/exchange-rates', () => {
    it('201: super_admin manuel kur girebilir', async () => {
      mockService.insertManual.mockResolvedValueOnce(sampleRate)

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/exchange-rates',
        headers: { authorization: `Bearer ${token}` },
        payload: { fromCurrency: 'USD', toCurrency: 'TRY', rate: '32.50000000' },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.fromCurrency).toBe('USD')
      expect(body.source).toBe('manual')
    })

    it('201: firma rolü manuel kur girebilir', async () => {
      mockService.insertManual.mockResolvedValueOnce(sampleRate)

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/exchange-rates',
        headers: { authorization: `Bearer ${token}` },
        payload: { fromCurrency: 'USD', toCurrency: 'TRY', rate: '32.50000000' },
      })

      expect(res.statusCode).toBe(201)
    })

    it('403: finans rolü manuel kur giremez', async () => {
      const token = makeToken(app, 'finans')
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/exchange-rates',
        headers: { authorization: `Bearer ${token}` },
        payload: { fromCurrency: 'USD', toCurrency: 'TRY', rate: '32.50000000' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/exchange-rates',
        payload: { fromCurrency: 'USD', toCurrency: 'TRY', rate: '32.50000000' },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // POST /sync
  describe('POST /api/v1/exchange-rates/sync', () => {
    it('200: super_admin senkronizasyon başlatabilir', async () => {
      mockService.syncFromExternal.mockResolvedValueOnce({
        synced:    2,
        source:    'binance',
        fetchedAt: now,
      })

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/exchange-rates/sync',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.synced).toBe(2)
      expect(body.source).toBe('binance')
    })

    it('403: firma rolü sync endpoint\'ine erişemez', async () => {
      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/exchange-rates/sync',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('503: tüm kaynaklar başarısız olursa 503 döner', async () => {
      const { AppError } = await import('../../errors/app-error.js')
      mockService.syncFromExternal.mockRejectedValueOnce(
        new AppError('EXCHANGE_RATE_SYNC_FAILED', 'Tüm kur kaynakları başarısız oldu.', 503)
      )

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/exchange-rates/sync',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(503)
    })
  })

  // GET /history
  describe('GET /api/v1/exchange-rates/history', () => {
    const sampleHistory = [
      {
        id:           RATE_ID,
        fromCurrency: 'USD',
        toCurrency:   'TRY',
        rate:         '32.50000000',
        source:       'manual',
        fetchedAt:    now,
        createdAt:    now,
      },
    ]

    beforeEach(() => {
      mockHistoryOffset.mockResolvedValue([])
    })

    it('200: authenticated kullanıcı kur geçmişini alabilir', async () => {
      mockHistoryOffset.mockResolvedValueOnce(sampleHistory)

      const token = makeToken(app, 'finans')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/exchange-rates/history',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].fromCurrency).toBe('USD')
      expect(body.meta.page).toBe(1)
      expect(body.meta.limit).toBe(50)
    })

    it('200: currency filtresiyle sorgu yapılabilir', async () => {
      mockHistoryOffset.mockResolvedValueOnce(sampleHistory)

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/exchange-rates/history?currency=USD',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it('200: sayfalama parametreleriyle çalışır', async () => {
      mockHistoryOffset.mockResolvedValueOnce([])

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/exchange-rates/history?page=2&limit=10',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.meta.page).toBe(2)
      expect(body.meta.limit).toBe(10)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/exchange-rates/history',
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
