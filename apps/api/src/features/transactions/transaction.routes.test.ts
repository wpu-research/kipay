import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest'
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
  notifications:       {},
  users:               {},
  sessions:            {},
  tenants:             {},
  transactions:        {},
  merchants:           {},
  financeGroupMembers: {},
  eq:      vi.fn((col, val) => ({ col, val })),
  and:     vi.fn((...args: unknown[]) => args),
  isNull:  vi.fn((col) => ({ col, isNull: true })),
  gt:      vi.fn((col, val) => ({ col, val, gt: true })),
  sql:     vi.fn((strings: TemplateStringsArray) => strings[0]),
  inArray: vi.fn((col, vals) => ({ col, vals })),
}))

vi.mock('./transaction.service.js', () => ({
  transactionService: {
    claimTransaction:                vi.fn(),
    listTransactions:                vi.fn(),
    listTransactionsForFinansGroup:  vi.fn(),
    initiateTransaction:             vi.fn(),
    getTransaction:                  vi.fn(),
    approveTransaction:              vi.fn(),
    rejectTransaction:               vi.fn(),
    flagTransaction:                 vi.fn(),
    resolveTransaction:              vi.fn(),
    addComment:                      vi.fn(),
    getTransactionWithComments:      vi.fn(),
  },
}))

vi.mock('../../sse/sse-manager.js', () => ({
  addConnection:      vi.fn(),
  removeConnection:   vi.fn(),
  emitToTenant:       vi.fn(),
  getConnectionCount: vi.fn(),
}))

// pg-boss mock — jobs plugin boss.send/work mocks
vi.mock('pg-boss', () => {
  const Boss = vi.fn().mockImplementation(() => ({
    start:    vi.fn().mockResolvedValue(undefined),
    stop:     vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue(undefined),
    work:     vi.fn().mockResolvedValue(undefined),
    send:     vi.fn().mockResolvedValue('job-id'),
  }))
  return { PgBoss: Boss }
})

import { db } from '@panel/db'
import { transactionService } from './transaction.service.js'
import { buildApp } from '../../app.js'

const mockService = transactionService as unknown as {
  claimTransaction:               ReturnType<typeof vi.fn>
  listTransactions:               ReturnType<typeof vi.fn>
  listTransactionsForFinansGroup: ReturnType<typeof vi.fn>
  approveTransaction:             ReturnType<typeof vi.fn>
  rejectTransaction:              ReturnType<typeof vi.fn>
  flagTransaction:                ReturnType<typeof vi.fn>
  resolveTransaction:             ReturnType<typeof vi.fn>
  addComment:                     ReturnType<typeof vi.fn>
  getTransactionWithComments:     ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID    = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TX_ID      = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const MERCHANT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const PAYMENT_ID  = '11111111-1111-1111-1111-111111111111'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

const now = new Date('2026-03-22T10:00:00Z')
const claimExpires = new Date(now.getTime() + 10 * 60 * 1000)

const claimedTx = {
  id:               TX_ID,
  tenantId:         TENANT_ID,
  merchantId:       MERCHANT_ID,
  paymentAccountId: PAYMENT_ID,
  externalUserId:   'player-1',
  amount:           '500.00',
  currency:         'TRY',
  status:           'PROCESSING',
  claimedBy:        USER_ID,
  claimedAt:        now,
  claimExpiresAt:   claimExpires,
  resolvedBy:       null,
  resolvedAt:       null,
  note:             null,
  createdAt:        now,
  updatedAt:        now,
}

const txList = {
  data: [{
    ...claimedTx,
    status:         'PENDING',
    claimedBy:      null,
    claimedAt:      null,
    claimExpiresAt: null,
  }],
  meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
}

describe('Transaction Routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    // boss plugin test'te kaydedilmiyor (main.ts'te kayıtlı) — fake decorator ekle
    const mockBoss = {
      send:     vi.fn().mockResolvedValue('job-id'),
      work:     vi.fn().mockResolvedValue(undefined),
      start:    vi.fn().mockResolvedValue(undefined),
      stop:     vi.fn().mockResolvedValue(undefined),
      schedule: vi.fn().mockResolvedValue(undefined),
    }
    app.decorate('boss', mockBoss)
    await app.listen({ port: 0, host: '127.0.0.1' })
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

  // --- POST /api/v1/transactions/:id/claim ---

  describe('POST /api/v1/transactions/:id/claim', () => {
    it('finans rolü, PENDING işlem → 200, PROCESSING döner', async () => {
      setupAuth()
      mockService.claimTransaction.mockResolvedValueOnce(claimedTx)

      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/claim`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { status: string; claimedBy: string }
      expect(body.status).toBe('PROCESSING')
      expect(body.claimedBy).toBe(USER_ID)
    })

    it('firma rolü → 403', async () => {
      setupAuth()
      const token = makeToken('firma')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/claim`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('token yok → 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url:    `/api/v1/transactions/${TX_ID}/claim`,
      })
      expect(res.statusCode).toBe(401)
    })

    it('zaten claim edilmişse service ALREADY_CLAIMED fırlatır → 409', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.claimTransaction.mockRejectedValueOnce(
        new AppError('ALREADY_CLAIMED', 'İşlem zaten claim edilmiş.', 409)
      )

      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/claim`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(409)
    })
  })

  // --- GET /api/v1/transactions/:id ---

  describe('GET /api/v1/transactions/:id', () => {
    const comments = [
      { id: 'aaaaaaaa-0000-0000-0000-000000000001', tenantId: TENANT_ID, transactionId: TX_ID, userId: USER_ID, userRole: 'finans',   content: 'İlk yorum',    createdAt: new Date('2026-03-22T10:00:00Z') },
      { id: 'aaaaaaaa-0000-0000-0000-000000000002', tenantId: TENANT_ID, transactionId: TX_ID, userId: USER_ID, userRole: 'operator', content: 'İkinci yorum', createdAt: new Date('2026-03-22T10:05:00Z') },
    ]
    const txWithComments = { ...claimedTx, comments }

    it('tüm roller detay görebilir → 200', async () => {
      setupAuth()
      mockService.getTransactionWithComments.mockResolvedValueOnce(txWithComments)

      const token = makeToken('operator')
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/transactions/${TX_ID}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { data: { id: string; comments: Array<{ id: string; userRole: string; content: string; createdAt: string }> } }
      expect(body.data.id).toBe(TX_ID)
      expect(body.data.comments).toHaveLength(2)
      expect(body.data.comments[0]!.userRole).toBe('finans')
      expect(body.data.comments[0]!.content).toBe('İlk yorum')
      expect(body.data.comments[1]!.userRole).toBe('operator')
      // createdAt sıralaması: ilk yorum eskiden önce
      expect(new Date(body.data.comments[0]!.createdAt).getTime())
        .toBeLessThan(new Date(body.data.comments[1]!.createdAt).getTime())
    })

    it('token yok → 401', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/transactions/${TX_ID}` })
      expect(res.statusCode).toBe(401)
    })
  })

  // --- POST /api/v1/transactions/:id/approve ---

  describe('POST /api/v1/transactions/:id/approve', () => {
    const resolvedAt = new Date('2026-03-22T11:00:00Z')
    const approvedTx = { ...claimedTx, status: 'APPROVED', resolvedBy: USER_ID, resolvedAt, note: null }

    it('finans rolü → 200 APPROVED', async () => {
      setupAuth()
      mockService.approveTransaction.mockResolvedValueOnce(approvedTx)

      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/approve`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { status: string; resolvedBy: string; resolvedAt: string }
      expect(body.status).toBe('APPROVED')
      expect(body.resolvedBy).toBe(USER_ID)
      expect(body.resolvedAt).toBe(resolvedAt.toISOString())
    })

    it('operator rolü → 403', async () => {
      setupAuth()
      const token = makeToken('operator')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/approve`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('super_admin rolü → 403 (AC5 — yalnızca finans)', async () => {
      setupAuth()
      const token = makeToken('super_admin')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/approve`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('başkasının claim\'ine onay → 403', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.approveTransaction.mockRejectedValueOnce(
        new AppError('FORBIDDEN', 'Bu işlemi yalnızca claim eden finans onaylayabilir.', 403)
      )

      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/approve`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('COMPLETED işlemi approve → 409', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.approveTransaction.mockRejectedValueOnce(
        new AppError('INVALID_STATE_TRANSITION', 'Yalnızca PROCESSING işlem onaylanabilir.', 409)
      )

      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/approve`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(409)
    })
  })

  // --- POST /api/v1/transactions/:id/reject ---

  describe('POST /api/v1/transactions/:id/reject', () => {
    const resolvedAt = new Date('2026-03-22T11:00:00Z')
    const rejectedTx = { ...claimedTx, status: 'REJECTED', note: 'Sahte işlem', resolvedBy: USER_ID, resolvedAt }

    it('finans rolü, reason var → 200 REJECTED, response shape doğru', async () => {
      setupAuth()
      mockService.rejectTransaction.mockResolvedValueOnce(rejectedTx)

      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/reject`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { reason: 'Sahte işlem' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { status: string; note: string; resolvedBy: string; resolvedAt: string }
      expect(body.status).toBe('REJECTED')
      expect(body.note).toBe('Sahte işlem')
      expect(body.resolvedBy).toBe(USER_ID)
      expect(body.resolvedAt).toBe(resolvedAt.toISOString())
    })

    it('reason eksik → 400', async () => {
      setupAuth()
      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/reject`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })

    it('operator rolü → 403', async () => {
      setupAuth()
      const token = makeToken('operator')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/reject`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { reason: 'test' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('super_admin rolü → 403 (AC5 — yalnızca finans)', async () => {
      setupAuth()
      const token = makeToken('super_admin')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/reject`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { reason: 'test' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  // --- POST /api/v1/transactions/:id/flag ---

  describe('POST /api/v1/transactions/:id/flag', () => {
    const flaggedTx = { ...claimedTx, status: 'FLAGGED' }

    it('finans rolü → 200 FLAGGED', async () => {
      setupAuth()
      mockService.flagTransaction.mockResolvedValueOnce(flaggedTx)

      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/flag`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { status: string }
      expect(body.status).toBe('FLAGGED')
    })

    it('operator rolü → 200 FLAGGED', async () => {
      setupAuth()
      mockService.flagTransaction.mockResolvedValueOnce(flaggedTx)

      const token = makeToken('operator')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/flag`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
    })

    it('firma rolü → 403', async () => {
      setupAuth()
      const token = makeToken('firma')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/flag`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  // --- POST /api/v1/transactions/:id/comments ---

  describe('POST /api/v1/transactions/:id/comments', () => {
    const commentCreatedAt = new Date('2026-03-22T10:30:00Z')
    const commentResult = {
      id: 'cmt-1', tenantId: TENANT_ID, transactionId: TX_ID, userId: USER_ID,
      userRole: 'finans', content: 'Test yorum', createdAt: commentCreatedAt,
    }

    it('finans rolü yorum ekleyebilir → 201, response shape doğru', async () => {
      setupAuth()
      mockService.addComment.mockResolvedValueOnce(commentResult)

      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/comments`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { content: 'Test yorum' },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body) as { content: string; userId: string; userRole: string; createdAt: string }
      expect(body.content).toBe('Test yorum')
      expect(body.userId).toBe(USER_ID)
      expect(body.userRole).toBe('finans')
      expect(body.createdAt).toBe(commentCreatedAt.toISOString())
    })

    it('firma rolü yorum ekleyebilir → 201', async () => {
      setupAuth()
      mockService.addComment.mockResolvedValueOnce({ ...commentResult, userRole: 'firma' })

      const token = makeToken('firma')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/comments`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { content: 'Firma yorumu' },
      })
      expect(res.statusCode).toBe(201)
    })

    it('operator rolü yorum ekleyebilir → 201', async () => {
      setupAuth()
      mockService.addComment.mockResolvedValueOnce(commentResult)

      const token = makeToken('operator')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/comments`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { content: 'Operator yorumu' },
      })
      expect(res.statusCode).toBe(201)
    })

    it('merchant rolü → 403', async () => {
      setupAuth()
      const token = makeToken('merchant')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/comments`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { content: 'deneme' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('content eksik → 400', async () => {
      setupAuth()
      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/comments`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // --- POST /api/v1/transactions/:id/resolve ---

  describe('POST /api/v1/transactions/:id/resolve', () => {
    const completedTx = { ...claimedTx, status: 'COMPLETED', note: 'Onay verildi', resolvedBy: USER_ID, resolvedAt: new Date() }
    const rejectedTx  = { ...claimedTx, status: 'REJECTED',  note: 'Reddedildi',  resolvedBy: USER_ID, resolvedAt: new Date() }

    it('firma rolü: FLAGGED → approved → 200 COMPLETED', async () => {
      setupAuth()
      mockService.resolveTransaction.mockResolvedValueOnce(completedTx)

      const token = makeToken('firma')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/resolve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { decision: 'approved', reason: 'Onay verildi' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { status: string; note: string }
      expect(body.status).toBe('COMPLETED')
      expect(body.note).toBe('Onay verildi')
    })

    it('firma rolü: FLAGGED → rejected → 200 REJECTED', async () => {
      setupAuth()
      mockService.resolveTransaction.mockResolvedValueOnce(rejectedTx)

      const token = makeToken('firma')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/resolve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { decision: 'rejected', reason: 'Reddedildi' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { status: string }
      expect(body.status).toBe('REJECTED')
    })

    it('super_admin rolü → 200', async () => {
      setupAuth()
      mockService.resolveTransaction.mockResolvedValueOnce(completedTx)

      const token = makeToken('super_admin')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/resolve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { decision: 'approved', reason: 'Admin onayı' },
      })
      expect(res.statusCode).toBe(200)
    })

    it('finans rolü → 403 FORBIDDEN', async () => {
      setupAuth()
      const token = makeToken('finans')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/resolve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { decision: 'approved', reason: 'neden' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('operator rolü → 403 FORBIDDEN', async () => {
      setupAuth()
      const token = makeToken('operator')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/resolve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { decision: 'approved', reason: 'neden' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('reason eksik → 400 REASON_REQUIRED', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.resolveTransaction.mockRejectedValueOnce(
        new AppError('REASON_REQUIRED', 'Karar açıklaması zorunludur.', 400)
      )

      const token = makeToken('firma')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/resolve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { decision: 'approved' },
      })
      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body) as { error: { code: string } }
      expect(body.error.code).toBe('REASON_REQUIRED')
    })

    it('FLAGGED değil → 409 INVALID_STATE_TRANSITION', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.resolveTransaction.mockRejectedValueOnce(
        new AppError('INVALID_STATE_TRANSITION', 'Yalnızca FLAGGED işlem kapatılabilir.', 409)
      )

      const token = makeToken('firma')
      const res = await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/resolve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { decision: 'approved', reason: 'neden' },
      })
      expect(res.statusCode).toBe(409)
    })

    it('approved: callback-retry job\'ı tetikler', async () => {
      setupAuth()
      mockService.resolveTransaction.mockResolvedValueOnce(completedTx)

      const token = makeToken('firma')
      await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/resolve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { decision: 'approved', reason: 'Onay' },
      })

      expect(app.boss.send).toHaveBeenCalledWith('callback-retry', { transactionId: TX_ID }, { retryLimit: 4, retryDelay: 120, singletonKey: TX_ID })
    })

    it('rejected: callback-retry job\'ı tetikler', async () => {
      setupAuth()
      mockService.resolveTransaction.mockResolvedValueOnce(rejectedTx)

      const token = makeToken('firma')
      await app.inject({
        method:  'POST',
        url:     `/api/v1/transactions/${TX_ID}/resolve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { decision: 'rejected', reason: 'Ret' },
      })

      expect(app.boss.send).toHaveBeenCalledWith('callback-retry', { transactionId: TX_ID }, { retryLimit: 4, retryDelay: 120, singletonKey: TX_ID })
    })
  })

  // --- GET /api/v1/transactions ---

  describe('GET /api/v1/transactions', () => {
    it('finans rolü → listTransactionsForFinansGroup çağrılır', async () => {
      setupAuth()
      mockService.listTransactionsForFinansGroup.mockResolvedValueOnce(txList)

      const token = makeToken('finans')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/transactions',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(mockService.listTransactionsForFinansGroup).toHaveBeenCalledTimes(1)
      const body = JSON.parse(res.body) as { data: unknown[]; meta: { total: number } }
      expect(body.meta.total).toBe(1)
    })

    it('firma rolü → listTransactions çağrılır', async () => {
      setupAuth()
      mockService.listTransactions.mockResolvedValueOnce(txList)

      const token = makeToken('firma')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/transactions',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(mockService.listTransactions).toHaveBeenCalledTimes(1)
    })

    it('token yok → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/transactions',
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
