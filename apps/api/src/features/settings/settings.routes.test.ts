import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:  { findFirst: vi.fn() },
      sessions: { findFirst: vi.fn() },
      users:    { findMany: vi.fn().mockResolvedValue([]) },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    select: vi.fn(),
    update: vi.fn(),
  },
  systemSettings: {},
  users:          {},
  sessions:       {},
  tenants:        {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args.filter(Boolean)),
  gt:     vi.fn((col, val) => ({ col, val })),
  isNull: vi.fn((col) => ({ col })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('./settings.service.js', () => ({
  settingsService: {
    getSettings:         vi.fn(),
    updateClaimTimeout:  vi.fn(),
  },
}))

import { db } from '@panel/db'
import { settingsService } from './settings.service.js'
import { buildApp } from '../../app.js'

const mockService = settingsService as unknown as {
  getSettings:        ReturnType<typeof vi.fn>
  updateClaimTimeout: ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID    = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

function makeToken(app: FastifyInstance, role: string) {
  return app.jwt.sign({ userId: USER_ID, tenantId: TENANT_ID, sessionId: SESSION_ID, role })
}

describe('Settings Routes', () => {
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

  // GET /api/v1/settings
  describe('GET /api/v1/settings', () => {
    it('200: super_admin konfigürasyonu okuyabilir', async () => {
      mockService.getSettings.mockResolvedValueOnce({ claimTimeoutMinutes: 10 })

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/settings',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().claimTimeoutMinutes).toBe(10)
    })

    it('200: firma rolü konfigürasyonu okuyabilir', async () => {
      mockService.getSettings.mockResolvedValueOnce({ claimTimeoutMinutes: 15 })

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/settings',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().claimTimeoutMinutes).toBe(15)
    })

    it('403: finans rolü erişemez', async () => {
      const token = makeToken(app, 'finans')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/settings',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/settings' })
      expect(res.statusCode).toBe(401)
    })
  })

  // PUT /api/v1/settings/claim-timeout
  describe('PUT /api/v1/settings/claim-timeout', () => {
    it('200: super_admin claim timeout güncelleyebilir', async () => {
      mockService.updateClaimTimeout.mockResolvedValueOnce({ claimTimeoutMinutes: 20 })

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'PUT',
        url:     '/api/v1/settings/claim-timeout',
        headers: { authorization: `Bearer ${token}` },
        payload: { timeoutMinutes: 20 },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().claimTimeoutMinutes).toBe(20)
    })

    it('400: 5 dakikanın altında değer geçersizdir', async () => {
      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'PUT',
        url:     '/api/v1/settings/claim-timeout',
        headers: { authorization: `Bearer ${token}` },
        payload: { timeoutMinutes: 3 },
      })

      expect(res.statusCode).toBe(400)
    })

    it('400: 60 dakikanın üstünde değer geçersizdir', async () => {
      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'PUT',
        url:     '/api/v1/settings/claim-timeout',
        headers: { authorization: `Bearer ${token}` },
        payload: { timeoutMinutes: 90 },
      })

      expect(res.statusCode).toBe(400)
    })

    it('403: firma rolü claim timeout güncelleyemez', async () => {
      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'PUT',
        url:     '/api/v1/settings/claim-timeout',
        headers: { authorization: `Bearer ${token}` },
        payload: { timeoutMinutes: 20 },
      })

      expect(res.statusCode).toBe(403)
    })

    it('403: finans rolü claim timeout güncelleyemez', async () => {
      const token = makeToken(app, 'finans')
      const res = await app.inject({
        method:  'PUT',
        url:     '/api/v1/settings/claim-timeout',
        headers: { authorization: `Bearer ${token}` },
        payload: { timeoutMinutes: 20 },
      })

      expect(res.statusCode).toBe(403)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({
        method:  'PUT',
        url:     '/api/v1/settings/claim-timeout',
        payload: { timeoutMinutes: 20 },
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
