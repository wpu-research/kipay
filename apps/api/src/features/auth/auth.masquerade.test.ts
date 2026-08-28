import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// DB mock — route handler'lar DB'ye erişir
vi.mock('@panel/db', () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
      sessions: { findFirst: vi.fn() },
      tenants: { findFirst: vi.fn() },
    },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  },
  users: {},
  sessions: {},
  tenants: {},
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:  vi.fn((col, val) => ({ col, val, gt: true })),
  sql: vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

import { db } from '@panel/db'
import { buildApp } from '../../app.js'

const mockDbQuery = db.query as unknown as {
  users: { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
  tenants: { findFirst: ReturnType<typeof vi.fn> }
}

// authenticate middleware'de firma/non-super_admin tokenları için tenant kontrolü yapılır
const activeTenant = { id: '44444444-4444-4444-4444-444444444444', status: 'active' as const }

// Test kullanıcı ve session sabitleri
const SUPER_ADMIN_ID  = '11111111-1111-1111-1111-111111111111'
const TARGET_USER_ID  = '22222222-2222-2222-2222-222222222222'
const SESSION_ID      = '33333333-3333-3333-3333-333333333333'
const TENANT_ID       = '44444444-4444-4444-4444-444444444444'

const superAdminUser = {
  id:           SUPER_ADMIN_ID,
  username:     'superadmin',
  role:         'super_admin',
  tenantId:     TENANT_ID,
  status:       'active',
  totpSecret:   null,
  passwordHash: 'hash',
  createdAt:    new Date(),
  updatedAt:    new Date(),
}

const targetUser = {
  id:           TARGET_USER_ID,
  username:     'firmacı',
  role:         'firma',
  tenantId:     TENANT_ID,
  status:       'active',
  totpSecret:   null,
  passwordHash: 'hash',
  createdAt:    new Date(),
  updatedAt:    new Date(),
}

const activeSession = {
  id:        SESSION_ID,
  userId:    SUPER_ADMIN_ID,
  revokedAt: null,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
}

describe('POST /api/v1/auth/masquerade/:userId', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  function makeSuperAdminToken() {
    return app.jwt.sign({
      userId:    SUPER_ADMIN_ID,
      username:  'superadmin',
      role:      'super_admin',
      tenantId:  TENANT_ID,
      sessionId: SESSION_ID,
    })
  }

  function makeFirmaToken() {
    return app.jwt.sign({
      userId:    TARGET_USER_ID,
      username:  'firmacı',
      role:      'firma',
      tenantId:  TENANT_ID,
      sessionId: SESSION_ID,
    })
  }

  // super_admin rolünde ama masquerading=true (nested guard testi: rol kontrolü geçer, nested guard devreye girer)
  function makeSuperAdminMasqueradeToken() {
    return app.jwt.sign({
      userId:         TARGET_USER_ID,
      username:       'başka-admin',
      role:           'super_admin' as const,
      tenantId:       TENANT_ID,
      sessionId:      SESSION_ID,
      masquerading:   true,
      originalUserId: SUPER_ADMIN_ID,
    })
  }

  beforeEach(() => {
    // Authenticate middleware: her test için session aktif döner (override gerekmedikçe)
    mockDbQuery.sessions.findFirst.mockResolvedValue(activeSession)
  })

  it('super_admin başarıyla masquerade yapabilir', async () => {
    mockDbQuery.users.findFirst.mockResolvedValue(targetUser)

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/masquerade/${TARGET_USER_ID}`,
      headers: { Cookie: `access_token=${makeSuperAdminToken()}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.targetUser.id).toBe(TARGET_USER_ID)
    expect(body.targetUser.role).toBe('firma')

    // Cookie set edilmiş mi?
    const setCookie = res.headers['set-cookie']
    expect(setCookie).toBeDefined()
    expect(setCookie).toContain('access_token=')
  })

  it('super_admin olmayan kullanıcı 403 alır', async () => {
    // authenticate middleware — firma token → tenant check geçmeli, sonra route guard FORBIDDEN döner
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/masquerade/${SUPER_ADMIN_ID}`,
      headers: { Cookie: `access_token=${makeFirmaToken()}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('zaten masquerade modundayken 403 alır (nested guard)', async () => {
    // super_admin rolündeyken masquerading=true → nested guard devreye girmeli
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/masquerade/${SUPER_ADMIN_ID}`,
      headers: { Cookie: `access_token=${makeSuperAdminMasqueradeToken()}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('MASQUERADE_NESTED_FORBIDDEN')
  })

  it('bulunamayan userId için 404 alır', async () => {
    mockDbQuery.users.findFirst.mockResolvedValue(null)
    const unknownId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/masquerade/${unknownId}`,
      headers: { Cookie: `access_token=${makeSuperAdminToken()}` },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })

  it('aktif olmayan hedef kullanıcı için 403 alır', async () => {
    mockDbQuery.users.findFirst.mockResolvedValue({ ...targetUser, status: 'inactive' })

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/masquerade/${TARGET_USER_ID}`,
      headers: { Cookie: `access_token=${makeSuperAdminToken()}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('USER_INACTIVE')
  })

  it('kendi kendine masquerade 403 alır', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/masquerade/${SUPER_ADMIN_ID}`,
      headers: { Cookie: `access_token=${makeSuperAdminToken()}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('hedef kullanıcı super_admin ise 403 alır (IG-1)', async () => {
    mockDbQuery.users.findFirst.mockResolvedValue({ ...superAdminUser, id: '55555555-5555-5555-5555-555555555555' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/masquerade/55555555-5555-5555-5555-555555555555',
      headers: { Cookie: `access_token=${makeSuperAdminToken()}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('masquerade token masquerading=true ve originalUserId içerir', async () => {
    mockDbQuery.users.findFirst.mockResolvedValue(targetUser)

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/masquerade/${TARGET_USER_ID}`,
      headers: { Cookie: `access_token=${makeSuperAdminToken()}` },
    })

    expect(res.statusCode).toBe(200)

    // Set-Cookie'den token'ı çıkar ve doğrula
    const cookieHeader = res.headers['set-cookie'] as string
    const tokenMatch = cookieHeader.match(/access_token=([^;]+)/)
    expect(tokenMatch).toBeTruthy()

    const decoded = app.jwt.decode(tokenMatch![1]) as Record<string, unknown>
    expect(decoded['masquerading']).toBe(true)
    expect(decoded['originalUserId']).toBe(SUPER_ADMIN_ID)
    expect(decoded['userId']).toBe(TARGET_USER_ID)
  })
})

describe('POST /api/v1/auth/masquerade/exit', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    // Authenticate middleware: her test için session aktif döner (override gerekmedikçe)
    mockDbQuery.sessions.findFirst.mockResolvedValue(activeSession)
  })

  function makeMasqueradeToken() {
    return app.jwt.sign({
      userId:         TARGET_USER_ID,
      username:       'firmacı',
      role:           'firma',
      tenantId:       TENANT_ID,
      sessionId:      SESSION_ID,
      masquerading:   true,
      originalUserId: SUPER_ADMIN_ID,
    })
  }

  function makeNormalToken() {
    return app.jwt.sign({
      userId:    SUPER_ADMIN_ID,
      username:  'superadmin',
      role:      'super_admin',
      tenantId:  TENANT_ID,
      sessionId: SESSION_ID,
    })
  }

  it('masquerade token ile çıkış yapılır ve orijinal token set edilir', async () => {
    // authenticate middleware — firma masquerade token → tenant check geçmeli
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)
    mockDbQuery.users.findFirst.mockResolvedValue(superAdminUser)
    mockDbQuery.sessions.findFirst.mockResolvedValue(activeSession)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/masquerade/exit',
      headers: { Cookie: `access_token=${makeMasqueradeToken()}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)

    // Orijinal super admin token'ı set edilmiş mi?
    const setCookie = res.headers['set-cookie'] as string
    expect(setCookie).toContain('access_token=')

    const tokenMatch = setCookie.match(/access_token=([^;]+)/)
    const decoded = app.jwt.decode(tokenMatch![1]) as Record<string, unknown>
    expect(decoded['userId']).toBe(SUPER_ADMIN_ID)
    expect(decoded['masquerading']).toBeUndefined()
  })

  it('masquerade modunda değilken 403 alır', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/masquerade/exit',
      headers: { Cookie: `access_token=${makeNormalToken()}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('FORBIDDEN')
  })

  it('orijinal kullanıcı bulunamazsa 401 alır', async () => {
    // authenticate middleware — firma masquerade token → tenant check geçmeli
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)
    mockDbQuery.users.findFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/masquerade/exit',
      headers: { Cookie: `access_token=${makeMasqueradeToken()}` },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHORIZED')
  })

  it('orijinal session geçersizse 401 alır', async () => {
    // authenticate middleware — firma masquerade token → tenant check geçmeli
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)
    mockDbQuery.users.findFirst.mockResolvedValue(superAdminUser)
    mockDbQuery.sessions.findFirst.mockResolvedValue(null) // session yok / revoke edilmiş

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/masquerade/exit',
      headers: { Cookie: `access_token=${makeMasqueradeToken()}` },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHORIZED')
  })
})
