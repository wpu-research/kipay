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
  users:    {},
  sessions: {},
  tenants:  {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('./blocked-user.service.js', () => ({
  blockedUserService: {
    blockUser:   vi.fn(),
    unblockUser: vi.fn(),
  },
}))

import { db } from '@panel/db'
import { blockedUserService } from './blocked-user.service.js'
import { buildApp } from '../../app.js'

const mockService = blockedUserService as unknown as {
  blockUser:   ReturnType<typeof vi.fn>
  unblockUser: ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID    = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TARGET_ID  = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

describe('Block User Routes — Yetki Kontrolleri', () => {
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

  describe('POST /api/v1/users/:id/block', () => {
    it('firma süreli engel koyabilir — 200 döner', async () => {
      setupAuth()
      const futureDate = new Date(Date.now() + 3_600_000).toISOString()
      mockService.blockUser.mockResolvedValueOnce({
        blockedUntil:         futureDate,
        isPermanentlyBlocked: false,
      })

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/users/${TARGET_ID}/block`,
        headers: { Cookie: `access_token=${makeToken('firma')}` },
        payload: { blockedUntil: futureDate },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.isPermanentlyBlocked).toBe(false)
      expect(res.json().data.blockedUntil).toBe(futureDate)
    })

    it('firma kalıcı engel koyabilir — isPermanentlyBlocked: true döner', async () => {
      setupAuth()
      mockService.blockUser.mockResolvedValueOnce({
        blockedUntil:         null,
        isPermanentlyBlocked: true,
      })

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/users/${TARGET_ID}/block`,
        headers: { Cookie: `access_token=${makeToken('firma')}` },
        payload: { permanent: true },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.isPermanentlyBlocked).toBe(true)
      expect(res.json().data.blockedUntil).toBeNull()
    })

    it('finans rolündeki kullanıcı bu endpoint\'e erişemez — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/users/${TARGET_ID}/block`,
        headers: { Cookie: `access_token=${makeToken('finans')}` },
        payload: { permanent: true },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })

    it('operator rolündeki kullanıcı bu endpoint\'e erişemez — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/users/${TARGET_ID}/block`,
        headers: { Cookie: `access_token=${makeToken('operator')}` },
        payload: { permanent: true },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })

    it('token olmadan — 401 döner', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/users/${TARGET_ID}/block`,
        payload: { permanent: true },
      })

      expect(res.statusCode).toBe(401)
    })

    it('geçersiz UUID ile — 400 VALIDATION_ERROR döner', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/users/not-a-uuid/block',
        headers: { Cookie: `access_token=${makeToken('firma')}` },
        payload: { permanent: true },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /api/v1/users/:id/unblock', () => {
    it('firma engeli kaldırabilir — 200 döner', async () => {
      setupAuth()
      mockService.unblockUser.mockResolvedValueOnce({ id: TARGET_ID, username: 'target' })

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/users/${TARGET_ID}/unblock`,
        headers: { Cookie: `access_token=${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.id).toBe(TARGET_ID)
    })

    it('finans rolündeki kullanıcı unblock yapamaz — 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/users/${TARGET_ID}/unblock`,
        headers: { Cookie: `access_token=${makeToken('finans')}` },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })
  })
})
