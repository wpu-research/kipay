import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// DB mock — authenticate middleware tenant ve session kontrolü yapar
vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:  { findFirst: vi.fn() },
      sessions: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    update: vi.fn(),
    transaction: vi.fn(),
  },
  auditLogs: {},
  users:    {},
  sessions: {},
  tenants:  {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

// userService mock — route yetki testleri servis katmanına ulaşmaz; sadece guard kontrolü yeterli
vi.mock('./user.service.js', () => ({
  userService: {
    createUser:       vi.fn(),
    updateUserStatus: vi.fn(),
    getUsers:         vi.fn(),
  },
}))

import { db } from '@panel/db'
import { buildApp } from '../../app.js'

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID    = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

describe('User Routes — Yetki Kontrolleri', () => {
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

  // ─── finans rolü ─────────────────────────────────────────────────────────

  describe('finans rolü tüm user endpoint\'lerinde 403 alır', () => {
    it('GET /api/v1/users → 403 FORBIDDEN', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
      mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { Cookie: `access_token=${makeToken('finans')}` },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })

    it('POST /api/v1/users → 403 FORBIDDEN', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
      mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/users',
        headers: { Cookie: `access_token=${makeToken('finans')}` },
        payload: { username: 'newuser', password: 'password123', role: 'operator' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })

    it('PATCH /api/v1/users/:id/status → 403 FORBIDDEN', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
      mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)

      const res = await app.inject({
        method:  'PATCH',
        url:     `/api/v1/users/${USER_ID}/status`,
        headers: { Cookie: `access_token=${makeToken('finans')}` },
        payload: { status: 'inactive' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })
  })

  // ─── operator rolü ───────────────────────────────────────────────────────

  describe('operator rolü tüm user endpoint\'lerinde 403 alır', () => {
    it('GET /api/v1/users → 403 FORBIDDEN', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
      mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
        headers: { Cookie: `access_token=${makeToken('operator')}` },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })

    it('POST /api/v1/users → 403 FORBIDDEN', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
      mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/users',
        headers: { Cookie: `access_token=${makeToken('operator')}` },
        payload: { username: 'newuser', password: 'password123', role: 'operator' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })

    it('PATCH /api/v1/users/:id/status → 403 FORBIDDEN', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
      mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)

      const res = await app.inject({
        method:  'PATCH',
        url:     `/api/v1/users/${USER_ID}/status`,
        headers: { Cookie: `access_token=${makeToken('operator')}` },
        payload: { status: 'inactive' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })
  })

  // ─── token yokken 401 ─────────────────────────────────────────────────────

  it('token olmadan GET /api/v1/users → 401 UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
    })

    expect(res.statusCode).toBe(401)
  })
})
