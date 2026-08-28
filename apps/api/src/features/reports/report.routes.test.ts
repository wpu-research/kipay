import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

const {
  mockInsertReturning,
  mockInsert,
  mockSelectWhere,
  mockDbSelect,
  mockBoss,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn().mockResolvedValue([])
  const mockInsertValues    = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert          = vi.fn(() => ({ values: mockInsertValues }))
  const mockSelectWhere     = vi.fn().mockResolvedValue([])
  const mockSelectFrom      = vi.fn(() => ({ where: mockSelectWhere }))
  const mockDbSelect        = vi.fn(() => ({ from: mockSelectFrom }))
  const mockBoss            = { send: vi.fn().mockResolvedValue('job-id') }
  return { mockInsertReturning, mockInsert, mockInsertValues, mockSelectWhere, mockSelectFrom, mockDbSelect, mockBoss }
})

vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:  { findFirst: vi.fn() },
      sessions: { findFirst: vi.fn() },
    },
    select: mockDbSelect,
    insert: mockInsert,
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  },
  transactions:  {},
  paymentAccounts: {},
  financeGroups: {},
  callbackLogs:  {},
  exportJobs:    {},
  users:         {},
  sessions:      {},
  tenants:       {},
  eq:       vi.fn((col, val) => ({ col, val })),
  and:      vi.fn((...args: unknown[]) => args.filter(Boolean)),
  gte:      vi.fn((col, val) => ({ col, val })),
  lte:      vi.fn((col, val) => ({ col, val })),
  inArray:  vi.fn((col, vals) => ({ col, vals })),
  sql:      vi.fn((strings: TemplateStringsArray) => strings[0]),
  isNull:   vi.fn((col) => ({ col })),
  gt:       vi.fn((col, val) => ({ col, val })),
}))

vi.mock('./report.service.js', () => ({
  reportService: {
    getTransactionReport:   vi.fn(),
    getFinanceGroupReport:  vi.fn(),
    getCallbackReport:      vi.fn(),
  },
}))

vi.mock('../../plugins/jobs.js', () => ({
  default: async (app: any) => {
    app.decorate('boss', mockBoss)
    app.addHook('onClose', async () => {})
  },
}))

import { db }            from '@panel/db'
import { reportService } from './report.service.js'
import { buildApp }      from '../../app.js'

const mockService = reportService as unknown as {
  getTransactionReport:   ReturnType<typeof vi.fn>
  getFinanceGroupReport:  ReturnType<typeof vi.fn>
  getCallbackReport:      ReturnType<typeof vi.fn>
}

const JOB_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID     = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const MERCHANT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const GROUP_ID    = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

function makeToken(app: FastifyInstance, role: string, extra: Record<string, unknown> = {}) {
  return app.jwt.sign({ userId: USER_ID, username: 'test', tenantId: TENANT_ID, sessionId: SESSION_ID, role, ...extra })
}

const sampleTransactionReport = {
  totalAmount:      '125430.50',
  transactionCount: 247,
  averageAmount:    '507.82',
  currency:         'TRY',
  filters:          { from: '2026-03-01', to: '2026-03-23' },
}

const sampleFinanceGroupReport = [
  {
    financeGroupId:   GROUP_ID,
    financeGroupName: 'Grup A',
    avgDurationMs:    45230,
    claimSuccessRate: 0.87,
    rejectionRate:    0.05,
  },
]

const sampleCallbackReport = {
  successRate:     0.94,
  avgAttemptCount: 1.8,
  deadLetterCount: 12,
}

describe('Report Routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    app.decorate('boss', mockBoss)
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

  // --- GET /api/v1/reports/transactions ---

  describe('GET /api/v1/reports/transactions', () => {
    it('200: firma rolü kendi tenant\'ı için rapor alabilir', async () => {
      mockService.getTransactionReport.mockResolvedValueOnce(sampleTransactionReport)

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/transactions',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.transactionCount).toBe(247)
      expect(body.data.totalAmount).toBe('125430.50')
      expect(mockService.getTransactionReport).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'firma', callerTenantId: TENANT_ID })
      )
    })

    it('200: super_admin filtresiz rapor alabilir', async () => {
      mockService.getTransactionReport.mockResolvedValueOnce(sampleTransactionReport)

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/transactions',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(mockService.getTransactionReport).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'super_admin' })
      )
    })

    it('200: super_admin tenantId filtresiyle sorgulayabilir', async () => {
      mockService.getTransactionReport.mockResolvedValueOnce(sampleTransactionReport)

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/reports/transactions?tenantId=${TENANT_ID}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(mockService.getTransactionReport).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID })
      )
    })

    it('403: merchant rolü merchantId claim\'i olmadan 403 alır', async () => {
      const token = makeToken(app, 'merchant')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/transactions',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/reports/transactions',
      })
      expect(res.statusCode).toBe(401)
    })

    it('200: boş veri senaryosunda sıfır değerleri döner', async () => {
      mockService.getTransactionReport.mockResolvedValueOnce({
        totalAmount:      '0',
        transactionCount: 0,
        averageAmount:    '0',
        currency:         null,
        filters:          {},
      })

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/transactions',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.totalAmount).toBe('0')
      expect(body.data.transactionCount).toBe(0)
      expect(body.data.currency).toBeNull()
    })
  })

  // --- GET /api/v1/reports/finance-groups ---

  describe('GET /api/v1/reports/finance-groups', () => {
    it('200: super_admin finans grubu raporunu alabilir', async () => {
      mockService.getFinanceGroupReport.mockResolvedValueOnce(sampleFinanceGroupReport)

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/finance-groups',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(1)
      expect(body.data[0].financeGroupName).toBe('Grup A')
      expect(body.data[0].claimSuccessRate).toBe(0.87)
    })

    it('403: firma rolü finans grubu raporuna erişemez', async () => {
      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/finance-groups',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('403: merchant rolü finans grubu raporuna erişemez', async () => {
      const token = makeToken(app, 'merchant')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/finance-groups',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('200: boş liste döner (finans grubu yoksa)', async () => {
      mockService.getFinanceGroupReport.mockResolvedValueOnce([])

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/finance-groups',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data).toHaveLength(0)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/reports/finance-groups',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // --- GET /api/v1/reports/callbacks ---

  describe('GET /api/v1/reports/callbacks', () => {
    it('200: super_admin callback raporunu alabilir', async () => {
      mockService.getCallbackReport.mockResolvedValueOnce(sampleCallbackReport)

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/callbacks',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.successRate).toBe(0.94)
      expect(body.data.deadLetterCount).toBe(12)
    })

    it('403: firma rolü callback raporuna erişemez', async () => {
      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/callbacks',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })

    it('200: boş callback senaryosunda sıfır değerleri döner', async () => {
      mockService.getCallbackReport.mockResolvedValueOnce({
        successRate:     0,
        avgAttemptCount: null,
        deadLetterCount: 0,
      })

      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/reports/callbacks',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.data.successRate).toBe(0)
      expect(body.data.avgAttemptCount).toBeNull()
      expect(body.data.deadLetterCount).toBe(0)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/reports/callbacks',
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // --- POST /api/v1/reports/export ---

  describe('POST /api/v1/reports/export', () => {
    beforeEach(() => {
      mockInsertReturning.mockResolvedValue([{
        id:     JOB_ID,
        status: 'pending',
        format: 'csv',
        createdAt: new Date(),
      }])
      mockBoss.send.mockResolvedValue('ok')
    })

    it('202: firma rolü CSV export başlatabilir', async () => {
      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/reports/export',
        headers: { authorization: `Bearer ${token}` },
        payload: { format: 'csv' },
      })

      expect(res.statusCode).toBe(202)
      const body = res.json()
      expect(body.jobId).toBe(JOB_ID)
      expect(mockBoss.send).toHaveBeenCalledWith('report-export', { jobId: JOB_ID }, { retryLimit: 2 })
    })

    it('202: super_admin cross-tenant xlsx export başlatabilir', async () => {
      const token = makeToken(app, 'super_admin')
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/reports/export',
        headers: { authorization: `Bearer ${token}` },
        payload: { format: 'xlsx', tenantId: TENANT_ID },
      })

      expect(res.statusCode).toBe(202)
      expect(res.json().jobId).toBe(JOB_ID)
    })

    it('403: operator rolü export yapamaz', async () => {
      const token = makeToken(app, 'operator')
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/reports/export',
        headers: { authorization: `Bearer ${token}` },
        payload: { format: 'csv' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/reports/export',
        payload: { format: 'csv' },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // --- GET /api/v1/reports/export/:jobId ---

  describe('GET /api/v1/reports/export/:jobId', () => {
    it('200: job sahibi durumu görebilir', async () => {
      const createdAt = new Date()
      mockSelectWhere.mockResolvedValueOnce([{
        id:                JOB_ID,
        status:            'pending',
        format:            'csv',
        createdAt,
        expiresAt:         null,
        requestedByUserId: USER_ID,
        role:              'firma',
      }])

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/reports/export/${JOB_ID}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.jobId).toBe(JOB_ID)
      expect(body.status).toBe('pending')
      expect(body.downloadUrl).toBeUndefined()
    })

    it('200: tamamlandığında downloadUrl döner', async () => {
      const createdAt = new Date()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      mockSelectWhere.mockResolvedValueOnce([{
        id:                JOB_ID,
        status:            'completed',
        format:            'csv',
        createdAt,
        expiresAt,
        requestedByUserId: USER_ID,
        role:              'firma',
      }])

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/reports/export/${JOB_ID}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().downloadUrl).toBe(`/api/v1/reports/export/${JOB_ID}/download`)
    })

    it('403: başka kullanıcının job\'una erişemez', async () => {
      const OTHER_USER = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
      mockSelectWhere.mockResolvedValueOnce([{
        id:                JOB_ID,
        status:            'pending',
        format:            'csv',
        createdAt:         new Date(),
        expiresAt:         null,
        requestedByUserId: OTHER_USER,
        role:              'firma',
      }])

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/reports/export/${JOB_ID}`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  // --- GET /api/v1/reports/export/:jobId/download ---

  describe('GET /api/v1/reports/export/:jobId/download', () => {
    it('410: süresi dolmuş export Gone döner', async () => {
      mockSelectWhere.mockResolvedValueOnce([{
        id:                JOB_ID,
        status:            'completed',
        format:            'csv',
        filePath:          '/tmp/reports-export/test.csv',
        createdAt:         new Date(),
        expiresAt:         new Date(Date.now() - 1000), // geçmiş
        requestedByUserId: USER_ID,
        role:              'firma',
      }])

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/reports/export/${JOB_ID}/download`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(410)
    })

    it('400: henüz tamamlanmamış export', async () => {
      mockSelectWhere.mockResolvedValueOnce([{
        id:                JOB_ID,
        status:            'processing',
        format:            'csv',
        filePath:          null,
        createdAt:         new Date(),
        expiresAt:         null,
        requestedByUserId: USER_ID,
        role:              'firma',
      }])

      const token = makeToken(app, 'firma')
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/reports/export/${JOB_ID}/download`,
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.statusCode).toBe(400)
    })

    it('401: auth olmadan reddedilir', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    `/api/v1/reports/export/${JOB_ID}/download`,
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
