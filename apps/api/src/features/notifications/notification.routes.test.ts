import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import * as sseManagerMock from '../../sse/sse-manager.js'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:  { findFirst: vi.fn() },
      sessions: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
  auditLogs:     {},
  notifications: {},
  users:         {},
  sessions:      {},
  tenants:       {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('./notification.service.js', () => ({
  notificationService: {
    listNotifications:          vi.fn(),
    markRead:                   vi.fn(),
    markAllRead:                vi.fn(),
    createPendingNotifications: vi.fn(),
  },
}))

vi.mock('../../sse/sse-manager.js', () => ({
  addConnection:    vi.fn(),
  removeConnection: vi.fn(),
  emitToTenant:     vi.fn(),
  getConnectionCount: vi.fn(),
}))

import { db } from '@panel/db'
import { notificationService } from './notification.service.js'
import { buildApp } from '../../app.js'

const mockService  = notificationService as unknown as {
  listNotifications:          ReturnType<typeof vi.fn>
  markRead:                   ReturnType<typeof vi.fn>
  markAllRead:                ReturnType<typeof vi.fn>
  createPendingNotifications: ReturnType<typeof vi.fn>
}

const mockSseManager = sseManagerMock as unknown as {
  addConnection:    ReturnType<typeof vi.fn>
  removeConnection: ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID    = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const NOTIF_ID   = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

const mockNotif = {
  id:        NOTIF_ID,
  type:      'transaction.pending',
  payload:   { type: 'transaction.pending', txId: 'tx-1', amount: '100.00', currency: 'TRY', merchantName: 'M', createdAt: '2026-01-01T00:00:00Z' },
  isRead:    false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

describe('Notification Routes', () => {
  let app: FastifyInstance
  let port: number

  beforeAll(async () => {
    app = await buildApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    port = (app.server.address() as { port: number }).port
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(() => {
    vi.clearAllMocks()
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

  // --- GET /api/v1/notifications/sse ---

  describe('GET /api/v1/notifications/sse', () => {
    it('finans rolü → 200, text/event-stream', async () => {
      setupAuth()
      const token = makeToken('finans')

      const controller = new AbortController()
      // AbortController ile bağlantıyı hemen kopar — headers alındıktan sonra
      const timeout = setTimeout(() => controller.abort(), 500)

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/notifications/sse`, {
          headers: { authorization: `Bearer ${token}` },
          signal:  controller.signal,
        })
        clearTimeout(timeout)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('text/event-stream')
      } catch (err: unknown) {
        clearTimeout(timeout)
        // AbortError bekleniyor — SSE asla kapanmaz, bu normaldir
        if ((err as Error).name !== 'AbortError') throw err
        // AbortError → bağlantı kabul edildi ama kapatıldı; addConnection çağrıldıysa başarılı
        expect(mockSseManager.addConnection).toHaveBeenCalledWith(TENANT_ID, USER_ID, expect.anything())
      }
    }, 10000)

    it('firma rolü → 403', async () => {
      setupAuth()
      const token = makeToken('firma')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/notifications/sse',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('token yok → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/notifications/sse',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // --- GET /api/v1/notifications ---

  describe('GET /api/v1/notifications', () => {
    it('finans rolü → sayfalı sonuç döner', async () => {
      setupAuth()
      mockService.listNotifications.mockResolvedValueOnce({
        data: [mockNotif],
        meta: { total: 1, page: 1, limit: 20 },
      })
      const token = makeToken('finans')
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/notifications`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { data: unknown[]; meta: { total: number } }
      expect(body.data).toHaveLength(1)
      expect(body.meta.total).toBe(1)
    })

    it('firma rolü → 403', async () => {
      setupAuth()
      const token = makeToken('firma')
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/notifications`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(403)
    })
  })

  // --- PATCH /api/v1/notifications/:id/read ---

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('finans rolü → { success: true }', async () => {
      setupAuth()
      mockService.markRead.mockResolvedValueOnce({ success: true })
      const token = makeToken('finans')
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/notifications/${NOTIF_ID}/read`, {
        method:  'PATCH',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true })
    })
  })

  // --- PATCH /api/v1/notifications/read-all ---

  describe('PATCH /api/v1/notifications/read-all', () => {
    it('finans rolü → { updated: N }', async () => {
      setupAuth()
      mockService.markAllRead.mockResolvedValueOnce({ updated: 3 })
      const token = makeToken('finans')
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/notifications/read-all`, {
        method:  'PATCH',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ updated: 3 })
    })
  })
})
