import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:  { findFirst: vi.fn() },
      sessions: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
  auditLogs:       {},
  paymentAccounts: {},
  users:    {},
  sessions: {},
  tenants:  {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('./payment-account.service.js', () => ({
  paymentAccountService: {
    createAccount:    vi.fn(),
    listAccounts:     vi.fn(),
    getAccount:       vi.fn(),
    updateAccount:    vi.fn(),
    updateStatus:     vi.fn(),
    updateDailyLimit: vi.fn(),
  },
}))

import { db } from '@panel/db'
import { paymentAccountService } from './payment-account.service.js'
import { buildApp } from '../../app.js'

const mockService = paymentAccountService as unknown as {
  createAccount:    ReturnType<typeof vi.fn>
  listAccounts:     ReturnType<typeof vi.fn>
  getAccount:       ReturnType<typeof vi.fn>
  updateAccount:    ReturnType<typeof vi.fn>
  updateStatus:     ReturnType<typeof vi.fn>
  updateDailyLimit: ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID   = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID      = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ACCOUNT_ID   = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const GROUP_ID     = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const PROVIDER_ID  = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

const mockAccount = {
  id:                ACCOUNT_ID,
  tenantId:          TENANT_ID,
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

const createPayload = {
  name:              'Test Hesap',
  accountNumber:     'TR330006100519786457841326',
  paymentProviderId: PROVIDER_ID,
  financeGroupId:    GROUP_ID,
  environment:       'production',
  dailyLimit:        '50000.00',
}

describe('Payment Account Routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  function makeToken(role: 'super_admin' | 'firma' | 'finans' | 'merchant' | 'operator') {
    return app.jwt.sign({
      userId:    USER_ID,
      username:  `testuser_${role}`,
      role,
      tenantId:  TENANT_ID,
      sessionId: SESSION_ID,
    })
  }

  function setupAuth() {
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)
  }

  // --- POST /api/v1/payment-accounts ---

  describe('POST /api/v1/payment-accounts', () => {
    it('firma rolü → 201', async () => {
      setupAuth()
      mockService.createAccount.mockResolvedValueOnce(mockAccount)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-accounts',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().data.name).toBe('Test Hesap')
      expect(res.json().data.dailyUsed).toBe('0.00')
    })

    it('super_admin → 201', async () => {
      setupAuth()
      mockService.createAccount.mockResolvedValueOnce(mockAccount)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-accounts',
        headers: { authorization: `Bearer ${makeToken('super_admin')}` },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(201)
    })

    it('merchant rolü → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-accounts',
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(403)
    })

    it('kimlik doğrulama yok → 401', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-accounts',
        payload: createPayload,
      })

      expect(res.statusCode).toBe(401)
    })

    it('çakışma → 409', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.createAccount.mockRejectedValueOnce(new AppError('PAYMENT_ACCOUNT_CONFLICT', 'Çakışma.', 409))

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-accounts',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: createPayload,
      })

      expect(res.statusCode).toBe(409)
    })
  })

  // --- GET /api/v1/payment-accounts ---

  describe('GET /api/v1/payment-accounts', () => {
    it('firma → 200, { data, meta }', async () => {
      setupAuth()
      mockService.listAccounts.mockResolvedValueOnce({ data: [mockAccount], meta: { total: 1, page: 1, limit: 20 } })

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/payment-accounts',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
      expect(res.json().meta.total).toBe(1)
    })

    it('financeGroupId + status filtresiyle 200', async () => {
      setupAuth()
      mockService.listAccounts.mockResolvedValueOnce({ data: [mockAccount], meta: { total: 1, page: 1, limit: 20 } })

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/payment-accounts?financeGroupId=${GROUP_ID}&status=active`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
    })

    it('merchant → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/payment-accounts',
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('kimlik doğrulama yok → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/payment-accounts',
      })

      expect(res.statusCode).toBe(401)
    })
  })

  // --- GET /api/v1/payment-accounts/:id ---

  describe('GET /api/v1/payment-accounts/:id', () => {
    it('firma → 200', async () => {
      setupAuth()
      mockService.getAccount.mockResolvedValueOnce(mockAccount)

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.id).toBe(ACCOUNT_ID)
    })

    it('mevcut olmayan → 404', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.getAccount.mockRejectedValueOnce(new AppError('NOT_FOUND', 'Bulunamadı.', 404))

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(404)
    })

    it('merchant → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}`,
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  // --- PUT /api/v1/payment-accounts/:id ---

  describe('PUT /api/v1/payment-accounts/:id', () => {
    it('firma → 200, güncellenen hesap döner', async () => {
      setupAuth()
      mockService.updateAccount.mockResolvedValueOnce({ ...mockAccount, name: 'Yeni Ad' })

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'Yeni Ad' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.name).toBe('Yeni Ad')
    })

    it('mevcut olmayan → 404', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.updateAccount.mockRejectedValueOnce(new AppError('NOT_FOUND', 'Bulunamadı.', 404))

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'Yeni Ad' },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  // --- PATCH /api/v1/payment-accounts/:id/status ---

  describe('PATCH /api/v1/payment-accounts/:id/status', () => {
    it('firma → 200, status=inactive', async () => {
      setupAuth()
      mockService.updateStatus.mockResolvedValueOnce({ ...mockAccount, status: 'inactive' as const })

      const res = await app.inject({
        method:  'PATCH',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}/status`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { status: 'inactive' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.status).toBe('inactive')
    })

    it('firma → 200, status=active', async () => {
      setupAuth()
      mockService.updateStatus.mockResolvedValueOnce(mockAccount)

      const res = await app.inject({
        method:  'PATCH',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}/status`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { status: 'active' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.status).toBe('active')
    })

    it('geçersiz status → 400', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'PATCH',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}/status`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { status: 'deleted' },
      })

      expect(res.statusCode).toBe(400)
    })

    it('merchant → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'PATCH',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}/status`,
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
        payload: { status: 'inactive' },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  // --- PUT /api/v1/payment-accounts/:id/daily-limit ---

  describe('PUT /api/v1/payment-accounts/:id/daily-limit', () => {
    it('firma → 200, dailyLimit güncellendi', async () => {
      setupAuth()
      mockService.updateDailyLimit.mockResolvedValueOnce({ ...mockAccount, dailyLimit: '99999.99' })

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}/daily-limit`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { dailyLimit: '99999.99' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.dailyLimit).toBe('99999.99')
    })

    it('geçersiz tutar formatı → 400', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}/daily-limit`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { dailyLimit: 'abc' },
      })

      expect(res.statusCode).toBe(400)
    })

    it('mevcut olmayan → 404', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.updateDailyLimit.mockRejectedValueOnce(new AppError('NOT_FOUND', 'Bulunamadı.', 404))

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}/daily-limit`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { dailyLimit: '1000.00' },
      })

      expect(res.statusCode).toBe(404)
    })

    it('merchant → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-accounts/${ACCOUNT_ID}/daily-limit`,
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
        payload: { dailyLimit: '1000.00' },
      })

      expect(res.statusCode).toBe(403)
    })
  })
})
