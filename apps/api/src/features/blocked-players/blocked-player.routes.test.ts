import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:        { findFirst: vi.fn() },
      sessions:       { findFirst: vi.fn() },
      blockedPlayers: { findFirst: vi.fn(), findMany: vi.fn() },
    },
    insert: vi.fn(),
    delete: vi.fn(),
  },
  blockedPlayers: {},
  merchants:      {},
  auditLogs:      {},
  sessions:       {},
  tenants:        {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  or:     vi.fn((...args: unknown[]) => args),
  gt:     vi.fn((col, val) => ({ col, val })),
  isNull: vi.fn((col) => ({ col })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('./blocked-player.service.js', () => ({
  blockedPlayerService: {
    blockPlayer:         vi.fn(),
    unblockPlayer:       vi.fn(),
    listBlockedPlayers:  vi.fn(),
    checkPlayerBlocked:  vi.fn(),
  },
}))

import { db } from '@panel/db'
import { blockedPlayerService } from './blocked-player.service.js'
import { buildApp } from '../../app.js'

const mockService = blockedPlayerService as unknown as {
  blockPlayer:         ReturnType<typeof vi.fn>
  unblockPlayer:       ReturnType<typeof vi.fn>
  listBlockedPlayers:  ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID     = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const MERCHANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const BLOCK_ID    = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

const sampleBlock = {
  id:             BLOCK_ID,
  merchantId:     MERCHANT_ID,
  externalUserId: 'player123',
  blockedUntil:   null,
  isPermanent:    true,
  createdBy:      USER_ID,
  createdAt:      '2026-03-23T00:00:00.000Z',
}

describe('Blocked Player Routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  function makeToken(role: 'super_admin' | 'firma' | 'finans' | 'operator') {
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

  describe('POST /api/v1/blocked-players', () => {
    it('firma rolü — kalıcı engel ekleyebilir, 201 döner', async () => {
      setupAuth()
      mockService.blockPlayer.mockResolvedValueOnce(sampleBlock)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/blocked-players',
        headers: { Cookie: `access_token=${makeToken('firma')}` },
        payload: { externalUserId: 'player123', merchantId: MERCHANT_ID, permanent: true },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().data.id).toBe(BLOCK_ID)
    })

    it('super_admin rolü — engel ekleyebilir, 201 döner', async () => {
      setupAuth()
      mockService.blockPlayer.mockResolvedValueOnce(sampleBlock)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/blocked-players',
        headers: { Cookie: `access_token=${makeToken('super_admin')}` },
        payload: { externalUserId: 'player123', merchantId: MERCHANT_ID, permanent: true },
      })

      expect(res.statusCode).toBe(201)
    })

    it('finans rolü bu endpoint\'e erişemez — 403 döner', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/blocked-players',
        headers: { Cookie: `access_token=${makeToken('finans')}` },
        payload: { externalUserId: 'player123', merchantId: MERCHANT_ID, permanent: true },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })

    it('token olmadan — 401 döner', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/blocked-players',
        payload: { externalUserId: 'player123', merchantId: MERCHANT_ID, permanent: true },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('GET /api/v1/blocked-players', () => {
    it('firma rolü — liste alabilir, 200 döner', async () => {
      setupAuth()
      mockService.listBlockedPlayers.mockResolvedValueOnce({
        data: [sampleBlock], total: 1, page: 1, limit: 20,
      })

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/blocked-players',
        headers: { Cookie: `access_token=${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
    })

    it('operator rolü bu endpoint\'e erişemez — 403 döner', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/blocked-players',
        headers: { Cookie: `access_token=${makeToken('operator')}` },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /api/v1/blocked-players/:id', () => {
    it('firma rolü — engeli kaldırabilir, 200 döner', async () => {
      setupAuth()
      mockService.unblockPlayer.mockResolvedValueOnce(sampleBlock)

      const res = await app.inject({
        method:  'DELETE',
        url:     `/api/v1/blocked-players/${BLOCK_ID}`,
        headers: { Cookie: `access_token=${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.id).toBe(BLOCK_ID)
    })

    it('finans rolü bu endpoint\'e erişemez — 403 döner', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'DELETE',
        url:     `/api/v1/blocked-players/${BLOCK_ID}`,
        headers: { Cookie: `access_token=${makeToken('finans')}` },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })

    it('geçersiz UUID formatı — 400 döner', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'DELETE',
        url:     '/api/v1/blocked-players/not-a-uuid',
        headers: { Cookie: `access_token=${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
