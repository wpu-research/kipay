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
  auditLogs:           {},
  merchants:           {},
  merchantApiKeys:     {},
  merchantIpWhitelist: {},
  users:               {},
  sessions:            {},
  tenants:             {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('./merchant-api-key.service.js', () => ({
  merchantApiKeyService: {
    getApiKeys:     vi.fn(),
    createApiKey:   vi.fn(),
    revokeApiKey:   vi.fn(),
    rotateApiKey:   vi.fn(),
    getIpWhitelist: vi.fn(),
    addIp:          vi.fn(),
    removeIp:       vi.fn(),
  },
}))

import { db } from '@panel/db'
import { merchantApiKeyService } from './merchant-api-key.service.js'
import { buildApp } from '../../app.js'

const mockService = merchantApiKeyService as unknown as {
  getApiKeys:     ReturnType<typeof vi.fn>
  createApiKey:   ReturnType<typeof vi.fn>
  revokeApiKey:   ReturnType<typeof vi.fn>
  rotateApiKey:   ReturnType<typeof vi.fn>
  getIpWhitelist: ReturnType<typeof vi.fn>
  addIp:          ReturnType<typeof vi.fn>
  removeIp:       ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID     = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const MERCHANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const KEY_ID      = 'key_abcdef1234567890'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

const mockApiKey = {
  id:         'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  merchantId: MERCHANT_ID,
  keyId:      KEY_ID,
  secret:     'sk_***...***',
  label:      null,
  status:     'active' as const,
  revokedAt:  null,
  createdAt:  '2026-01-01T00:00:00.000Z',
}

const mockApiKeyPlaintext = { ...mockApiKey, secret: 'sk_' + 'a'.repeat(64) }

const mockIpEntry = {
  id:         'ffffffff-ffff-ffff-ffff-ffffffffffff',
  merchantId: MERCHANT_ID,
  ipAddress:  '192.168.1.100',
  createdAt:  '2026-01-01T00:00:00.000Z',
}

describe('Merchant API Key Routes', () => {
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

  // --- GET /:id/api-keys ---

  describe('GET /api/v1/merchants/:id/api-keys', () => {
    it('firma rolü — 200, masked secret', async () => {
      setupAuth()
      mockService.getApiKeys.mockResolvedValueOnce([mockApiKey])

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].secret).toBe('sk_***...***')
    })

    it('merchant rolü — 200, masked secret', async () => {
      setupAuth()
      mockService.getApiKeys.mockResolvedValueOnce([mockApiKey])

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
      })

      expect(res.statusCode).toBe(200)
    })

    it('finans rolü — 403 FORBIDDEN', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        headers: { authorization: `Bearer ${makeToken('finans')}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('operator rolü — 403 FORBIDDEN', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        headers: { authorization: `Bearer ${makeToken('operator')}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('unauthenticated — 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
      })

      expect(res.statusCode).toBe(401)
    })
  })

  // --- POST /:id/api-keys ---

  describe('POST /api/v1/merchants/:id/api-keys', () => {
    it('firma rolü — 201, secret plaintext görünür', async () => {
      setupAuth()
      mockService.createApiKey.mockResolvedValueOnce(mockApiKeyPlaintext)

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: {},
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.data.secret).not.toBe('sk_***...***')
    })

    it('super_admin — 201', async () => {
      setupAuth()
      mockService.createApiKey.mockResolvedValueOnce(mockApiKeyPlaintext)

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        headers: { authorization: `Bearer ${makeToken('super_admin')}` },
        payload: {},
      })

      expect(res.statusCode).toBe(201)
    })

    it('merchant rolü — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
        payload: {},
      })

      expect(res.statusCode).toBe(403)
    })

    it('finans rolü — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        headers: { authorization: `Bearer ${makeToken('finans')}` },
        payload: {},
      })

      expect(res.statusCode).toBe(403)
    })

    it('operator rolü — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        headers: { authorization: `Bearer ${makeToken('operator')}` },
        payload: {},
      })

      expect(res.statusCode).toBe(403)
    })

    it('unauthenticated — 401', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys`,
        payload: {},
      })

      expect(res.statusCode).toBe(401)
    })
  })

  // --- DELETE /:id/api-keys/:keyId ---

  describe('DELETE /api/v1/merchants/:id/api-keys/:keyId', () => {
    it('firma rolü — 204', async () => {
      setupAuth()
      mockService.revokeApiKey.mockResolvedValueOnce(undefined)

      const res = await app.inject({
        method:  'DELETE',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys/${KEY_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(204)
    })

    it('merchant rolü — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'DELETE',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys/${KEY_ID}`,
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  // --- POST /:id/api-keys/:keyId/rotate ---

  describe('POST /api/v1/merchants/:id/api-keys/:keyId/rotate', () => {
    it('firma rolü — 200, yeni secret görünür', async () => {
      setupAuth()
      mockService.rotateApiKey.mockResolvedValueOnce(mockApiKeyPlaintext)

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys/${KEY_ID}/rotate`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.secret).not.toBe('sk_***...***')
    })

    it('merchant rolü — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/api-keys/${KEY_ID}/rotate`,
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  // --- POST /:id/ip-whitelist ---

  describe('POST /api/v1/merchants/:id/ip-whitelist', () => {
    it('firma, merchant, super_admin — 201', async () => {
      for (const role of ['firma', 'merchant', 'super_admin'] as const) {
        setupAuth()
        mockService.addIp.mockResolvedValueOnce(mockIpEntry)

        const res = await app.inject({
          method:  'POST',
          url:     `/api/v1/merchants/${MERCHANT_ID}/ip-whitelist`,
          headers: { authorization: `Bearer ${makeToken(role)}` },
          payload: { ipAddress: '192.168.1.100' },
        })

        expect(res.statusCode).toBe(201)
      }
    })

    it('finans rolü — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/ip-whitelist`,
        headers: { authorization: `Bearer ${makeToken('finans')}` },
        payload: { ipAddress: '192.168.1.100' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('operator rolü — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/ip-whitelist`,
        headers: { authorization: `Bearer ${makeToken('operator')}` },
        payload: { ipAddress: '192.168.1.100' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('duplicate IP — 409', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.addIp.mockRejectedValueOnce(
        new AppError('IP_ALREADY_EXISTS', "Bu IP adresi zaten whitelist'te.", 409)
      )

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/merchants/${MERCHANT_ID}/ip-whitelist`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { ipAddress: '192.168.1.100' },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('IP_ALREADY_EXISTS')
    })
  })

  // --- DELETE /:id/ip-whitelist/:ip ---

  describe('DELETE /api/v1/merchants/:id/ip-whitelist/:ip', () => {
    it('firma, merchant, super_admin — 204', async () => {
      for (const role of ['firma', 'merchant', 'super_admin'] as const) {
        setupAuth()
        mockService.removeIp.mockResolvedValueOnce(undefined)

        const res = await app.inject({
          method:  'DELETE',
          url:     `/api/v1/merchants/${MERCHANT_ID}/ip-whitelist/192.168.1.100`,
          headers: { authorization: `Bearer ${makeToken(role)}` },
        })

        expect(res.statusCode).toBe(204)
      }
    })

    it('olmayan IP — 404', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.removeIp.mockRejectedValueOnce(
        new AppError('NOT_FOUND', "IP adresi whitelist'te bulunamadı.", 404)
      )

      const res = await app.inject({
        method:  'DELETE',
        url:     `/api/v1/merchants/${MERCHANT_ID}/ip-whitelist/10.0.0.1`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})
