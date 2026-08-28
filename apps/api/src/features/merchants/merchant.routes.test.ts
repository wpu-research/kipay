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
  auditLogs: {},
  merchants: {},
  users:     {},
  sessions:  {},
  tenants:   {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('./merchant.service.js', () => ({
  merchantService: {
    createMerchant:       vi.fn(),
    getMerchants:         vi.fn(),
    getMerchantById:      vi.fn(),
    updateMerchantStatus: vi.fn(),
  },
}))

import { db } from '@panel/db'
import { merchantService } from './merchant.service.js'
import { buildApp } from '../../app.js'

const mockService = merchantService as unknown as {
  createMerchant:       ReturnType<typeof vi.fn>
  getMerchants:         ReturnType<typeof vi.fn>
  getMerchantById:      ReturnType<typeof vi.fn>
  updateMerchantStatus: ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID     = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const MERCHANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

const mockMerchant = {
  id:             MERCHANT_ID,
  tenantId:       TENANT_ID,
  merchantName:   'Test Merchant',
  webhookUrl:     'https://example.com/webhook',
  isSandbox:      true,
  status:         'active' as const,
  contactEmail:   null,
  contactPhone:   null,
  contactAddress: null,
  createdAt:      new Date('2026-01-01T00:00:00Z'),
  updatedAt:      new Date('2026-01-01T00:00:00Z'),
}

describe('Merchant Routes', () => {
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

  describe('POST /api/v1/merchants', () => {
    it('firma rolü merchant oluşturabilir — 201 döner', async () => {
      setupAuth()
      mockService.createMerchant.mockResolvedValueOnce(mockMerchant)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/merchants',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { merchantName: 'Test Merchant', webhookUrl: 'https://example.com/webhook', isSandbox: true },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.data.merchantName).toBe('Test Merchant')
    })

    it('super_admin merchant oluşturabilir — 201 döner', async () => {
      setupAuth()
      mockService.createMerchant.mockResolvedValueOnce(mockMerchant)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/merchants',
        headers: { authorization: `Bearer ${makeToken('super_admin')}` },
        payload: { merchantName: 'Test Merchant', webhookUrl: 'https://example.com/webhook', isSandbox: true },
      })

      expect(res.statusCode).toBe(201)
    })

    it('finans rolü → 403 FORBIDDEN', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/merchants',
        headers: { authorization: `Bearer ${makeToken('finans')}` },
        payload: { merchantName: 'Test Merchant', webhookUrl: 'https://example.com/webhook', isSandbox: true },
      })

      expect(res.statusCode).toBe(403)
    })

    it('merchant rolü → 403 FORBIDDEN', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/merchants',
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
        payload: { merchantName: 'Test Merchant', webhookUrl: 'https://example.com/webhook', isSandbox: true },
      })

      expect(res.statusCode).toBe(403)
    })

    it('operator rolü → 403 FORBIDDEN', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/merchants',
        headers: { authorization: `Bearer ${makeToken('operator')}` },
        payload: { merchantName: 'Test Merchant', webhookUrl: 'https://example.com/webhook', isSandbox: true },
      })

      expect(res.statusCode).toBe(403)
    })

    it('unauthenticated → 401', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/merchants',
        payload: { merchantName: 'Test Merchant', webhookUrl: 'https://example.com/webhook', isSandbox: true },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/v1/merchants', () => {
    it('firma sayfalı liste alır — 200 + data + meta', async () => {
      setupAuth()
      mockService.getMerchants.mockResolvedValueOnce({
        data: [mockMerchant],
        meta: { total: 1, page: 1, limit: 20 },
      })

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/merchants',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.meta.total).toBe(1)
    })

    it('unauthenticated → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/merchants',
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/v1/merchants/:id', () => {
    it('kendi tenant merchant → 200', async () => {
      setupAuth()
      mockService.getMerchantById.mockResolvedValueOnce(mockMerchant)

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/merchants/${MERCHANT_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.id).toBe(MERCHANT_ID)
    })

    it('başka tenant merchant → 404 (servis 404 fırlatır)', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.getMerchantById.mockRejectedValueOnce(
        new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
      )

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/merchants/${MERCHANT_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe('PATCH /api/v1/merchants/:id/status', () => {
    it('durum değiştirir — 200', async () => {
      setupAuth()
      const inactive = { ...mockMerchant, status: 'inactive' as const }
      mockService.updateMerchantStatus.mockResolvedValueOnce(inactive)

      const res = await app.inject({
        method:  'PATCH',
        url:     `/api/v1/merchants/${MERCHANT_ID}/status`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { status: 'inactive' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.status).toBe('inactive')
    })

    it('başka tenant merchant → 404', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.updateMerchantStatus.mockRejectedValueOnce(
        new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
      )

      const res = await app.inject({
        method:  'PATCH',
        url:     `/api/v1/merchants/${MERCHANT_ID}/status`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { status: 'inactive' },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
