import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// @panel/db mock — authenticate middleware tenant ve session kontrolü yapar
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
  gte:    vi.fn((col, val) => ({ col, val, gte: true })),
  lte:    vi.fn((col, val) => ({ col, val, lte: true })),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('../audit/audit.service.js', () => ({
  auditLogService: {
    createAuditLog:      vi.fn().mockResolvedValue(undefined),
    getTenantAuditLogs:  vi.fn(),
  },
}))

vi.mock('./tenant.service.js', () => ({
  tenantService: {
    getTenants:          vi.fn(),
    getTenantById:       vi.fn(),
    createTenant:        vi.fn(),
    updateTenant:        vi.fn(),
    updateTenantStatus:  vi.fn(),
  },
}))

import { db } from '@panel/db'
import { auditLogService } from '../audit/audit.service.js'
import { buildApp } from '../../app.js'

const mockService = auditLogService as unknown as {
  getTenantAuditLogs: ReturnType<typeof vi.fn>
  createAuditLog:     ReturnType<typeof vi.fn>
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

const mockAuditLog = {
  id:           'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  tenantId:     TENANT_ID,
  userId:       USER_ID,
  userRole:     'super_admin' as const,
  action:       'tenant.created',
  resourceType: 'tenant',
  resourceId:   TENANT_ID,
  ip:           '127.0.0.1',
  changes:      { name: 'Test' },
  createdAt:    new Date('2026-03-21T10:00:00.000Z'),
}

describe('Tenant Audit Log Route — GET /api/v1/tenants/:id/audit-logs', () => {
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

  // ─── Yetki kontrolleri ──────────────────────────────────────────────────────

  it('super_admin audit log listesini alabilir — 200 döner', async () => {
    setupAuth()
    mockService.getTenantAuditLogs.mockResolvedValueOnce({
      data: [mockAuditLog],
      meta: { total: 1, page: 1, limit: 20 },
    })

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/tenants/${TENANT_ID}/audit-logs`,
      headers: { Cookie: `access_token=${makeToken('super_admin')}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].action).toBe('tenant.created')
    expect(body.meta.total).toBe(1)
  })

  it('firma rolü audit log endpoint\'ine erişemez — 403 FORBIDDEN', async () => {
    setupAuth()

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/tenants/${TENANT_ID}/audit-logs`,
      headers: { Cookie: `access_token=${makeToken('firma')}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('finans rolü audit log endpoint\'ine erişemez — 403 FORBIDDEN', async () => {
    setupAuth()

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/tenants/${TENANT_ID}/audit-logs`,
      headers: { Cookie: `access_token=${makeToken('finans')}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('token olmadan — 401 UNAUTHORIZED döner', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    `/api/v1/tenants/${TENANT_ID}/audit-logs`,
    })

    expect(res.statusCode).toBe(401)
  })

  // ─── Filtre ve sayfalama ────────────────────────────────────────────────────

  it('action filtresi servis metoduna iletilir', async () => {
    setupAuth()
    mockService.getTenantAuditLogs.mockResolvedValueOnce({
      data: [],
      meta: { total: 0, page: 1, limit: 20 },
    })

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/tenants/${TENANT_ID}/audit-logs?action=tenant.created`,
      headers: { Cookie: `access_token=${makeToken('super_admin')}` },
    })

    expect(res.statusCode).toBe(200)
    expect(mockService.getTenantAuditLogs).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ action: 'tenant.created' }),
      expect.any(Object),
    )
  })

  it('from/to tarih filtresi servis metoduna iletilir', async () => {
    setupAuth()
    mockService.getTenantAuditLogs.mockResolvedValueOnce({
      data: [],
      meta: { total: 0, page: 1, limit: 20 },
    })

    const from = '2026-03-01T00:00:00.000Z'
    const to   = '2026-03-21T23:59:59.999Z'

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/tenants/${TENANT_ID}/audit-logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { Cookie: `access_token=${makeToken('super_admin')}` },
    })

    expect(res.statusCode).toBe(200)
    expect(mockService.getTenantAuditLogs).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ from, to }),
      expect.any(Object),
    )
  })

  it('sayfalama parametreleri servis metoduna iletilir', async () => {
    setupAuth()
    mockService.getTenantAuditLogs.mockResolvedValueOnce({
      data: [],
      meta: { total: 50, page: 3, limit: 10 },
    })

    const res = await app.inject({
      method:  'GET',
      url:     `/api/v1/tenants/${TENANT_ID}/audit-logs?page=3&limit=10`,
      headers: { Cookie: `access_token=${makeToken('super_admin')}` },
    })

    expect(res.statusCode).toBe(200)
    expect(mockService.getTenantAuditLogs).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(Object),
      expect.objectContaining({ page: 3, limit: 10 }),
    )
  })

  it('geçersiz UUID tenant id ile — 400 VALIDATION_ERROR döner', async () => {
    setupAuth()

    const res = await app.inject({
      method:  'GET',
      url:     '/api/v1/tenants/not-a-valid-uuid/audit-logs',
      headers: { Cookie: `access_token=${makeToken('super_admin')}` },
    })

    expect(res.statusCode).toBe(400)
  })
})
