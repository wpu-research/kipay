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

vi.mock('./callback.service.js', () => ({
  callbackService: {
    retryCallback:    vi.fn(),
    listCallbackLogs: vi.fn(),
    simulateCallback: vi.fn(),
  },
}))

import { db } from '@panel/db'
import { callbackService } from './callback.service.js'
import { buildApp } from '../../app.js'

const mockService = callbackService as unknown as {
  retryCallback:    ReturnType<typeof vi.fn>
  listCallbackLogs: ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID    = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TX_ID      = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

describe('Callback Routes', () => {
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
    mockDbQuery.sessions.findFirst.mockResolvedValue(activeSession)
    mockDbQuery.tenants.findFirst.mockResolvedValue(activeTenant)
  }

  describe('POST /api/v1/transactions/:id/retry-callback', () => {
    it('firma rolü retry başlatabilir — 200 ve jobId döner', async () => {
      setupAuth()
      mockService.retryCallback.mockResolvedValue({ jobId: 'job-123' })

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/retry-callback`,
        headers: { Cookie: `access_token=${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().jobId).toBe('job-123')
    })

    it('super_admin rolü retry başlatabilir — 200 döner', async () => {
      setupAuth()
      mockService.retryCallback.mockResolvedValue({ jobId: 'job-456' })

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/retry-callback`,
        headers: { Cookie: `access_token=${makeToken('super_admin')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().jobId).toBe('job-456')
    })

    it('finans rolü retry yapamaz — 403 FORBIDDEN', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/retry-callback`,
        headers: { Cookie: `access_token=${makeToken('finans')}` },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN')
    })

    it('token olmadan — 401 döner', async () => {
      const res = await app.inject({
        method: 'POST',
        url:    `/api/v1/transactions/${TX_ID}/retry-callback`,
      })

      expect(res.statusCode).toBe(401)
    })

    it('geçersiz UUID — 400 VALIDATION_ERROR döner', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/transactions/not-a-uuid/retry-callback',
        headers: { Cookie: `access_token=${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(400)
    })

    it('callbackStatus uygun değilse — 409 INVALID_CALLBACK_STATE döner', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.retryCallback.mockRejectedValueOnce(
        new AppError('INVALID_CALLBACK_STATE', "Callback yalnızca 'failed' veya 'dead' durumundaki işlemler için yeniden tetiklenebilir.", 409)
      )

      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/retry-callback`,
        headers: { Cookie: `access_token=${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('INVALID_CALLBACK_STATE')
    })
  })

  describe('GET /api/v1/transactions/:id/callbacks', () => {
    it('authenticate edilmiş kullanıcı callback geçmişini görebilir — 200 döner', async () => {
      setupAuth()
      const mockLogs = [
        {
          id:             'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          transactionId:  TX_ID,
          attemptNumber:  1,
          sentAt:         '2026-03-23T10:00:00.000Z',
          responseStatus: 200,
          responseBody:   '{"ok":true}',
          success:        true,
          errorMessage:   null,
        },
      ]
      mockService.listCallbackLogs.mockResolvedValue(mockLogs)

      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/transactions/${TX_ID}/callbacks`,
        headers: { Cookie: `access_token=${makeToken('finans')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
      expect(res.json().data[0].attemptNumber).toBe(1)
    })

    it('token olmadan — 401 döner', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    `/api/v1/transactions/${TX_ID}/callbacks`,
      })

      expect(res.statusCode).toBe(401)
    })

    it('geçersiz UUID — 400 döner', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/transactions/not-a-uuid/callbacks',
        headers: { Cookie: `access_token=${makeToken('finans')}` },
      })

      expect(res.statusCode).toBe(400)
    })
  })
})
