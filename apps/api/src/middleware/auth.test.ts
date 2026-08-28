import { describe, it, expect, vi, beforeEach } from 'vitest'

// @panel/db mock
vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:  { findFirst: vi.fn() },
      sessions: { findFirst: vi.fn() },
    },
  },
  tenants:  {},
  sessions: {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

// @fastify/jwt mock — jwtVerify request'e user ekler
const mockJwtVerify = vi.fn()

import { db } from '@panel/db'
import { authenticate } from './auth.js'

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const activeSession = { id: 'sid-1', revokedAt: null }

function makeRequest(userOverride?: Partial<{ role: string; tenantId: string }>) {
  const req = {
    jwtVerify: mockJwtVerify,
    user: { userId: 'uid-1', role: 'firma', tenantId: 'tid-1', username: 'test', sessionId: 'sid-1', ...userOverride },
    log: { warn: vi.fn() },
  }
  return req as unknown as Parameters<typeof authenticate>[0]
}

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockJwtVerify.mockResolvedValue(undefined)
  })

  it('geçerli JWT, aktif session ve aktif tenant → geçer', async () => {
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce({ status: 'active' })
    const req = makeRequest()
    await expect(authenticate(req, {} as never)).resolves.toBeUndefined()
  })

  it('revoke edilmiş session → UNAUTHORIZED (401)', async () => {
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(null)
    const req = makeRequest({ role: 'firma' })
    await expect(authenticate(req, {} as never)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    })
    // Revoke hatası session aşamasında yakalanır — tenant DB çağrısı yapılmaz
    expect(mockDbQuery.tenants.findFirst).not.toHaveBeenCalled()
  })

  it('super_admin — revoke edilmiş session → UNAUTHORIZED (401)', async () => {
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(null)
    const req = makeRequest({ role: 'super_admin' })
    await expect(authenticate(req, {} as never)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    })
  })

  it('inactive tenant → TENANT_INACTIVE (403)', async () => {
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce({ status: 'inactive' })
    const req = makeRequest({ role: 'firma' })
    await expect(authenticate(req, {} as never)).rejects.toMatchObject({
      code: 'TENANT_INACTIVE',
      statusCode: 403,
    })
  })

  // P-3: Bulunamayan tenant UNAUTHORIZED (401) — TENANT_INACTIVE (403) ile karışmaz
  it('tenant bulunamadı → UNAUTHORIZED (401)', async () => {
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(null)
    const req = makeRequest({ role: 'finans' })
    await expect(authenticate(req, {} as never)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    })
  })

  it('super_admin için tenant status kontrolü yapılmaz — tenant DB çağrısı yok', async () => {
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
    const req = makeRequest({ role: 'super_admin' })
    await expect(authenticate(req, {} as never)).resolves.toBeUndefined()
    expect(mockDbQuery.tenants.findFirst).not.toHaveBeenCalled()
  })

  it('süresi dolmuş session (expiresAt kontrolü) → UNAUTHORIZED (401)', async () => {
    // expiresAt > now() WHERE koşulu sağlanmadığında findFirst null döner
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(null)
    const req = makeRequest({ role: 'firma' })
    await expect(authenticate(req, {} as never)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    })
    expect(mockDbQuery.tenants.findFirst).not.toHaveBeenCalled()
  })

  it('geçersiz JWT → UNAUTHORIZED (401)', async () => {
    const req = makeRequest()
    mockJwtVerify.mockRejectedValueOnce(new Error('Invalid token'))
    await expect(authenticate(req, {} as never)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    })
  })

  it('süresi dolmuş JWT → TOKEN_EXPIRED (401)', async () => {
    const req = makeRequest()
    const expiredErr = new Error('Expired')
    expiredErr.name = 'TokenExpiredError'
    mockJwtVerify.mockRejectedValueOnce(expiredErr)
    await expect(authenticate(req, {} as never)).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
      statusCode: 401,
    })
  })

  // P-4: tenantId eksik olan token bozuk SQL predicate oluşturmasın
  it('non-super_admin için tenantId eksikse → UNAUTHORIZED (401)', async () => {
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
    const req = makeRequest({ role: 'firma', tenantId: undefined })
    await expect(authenticate(req, {} as never)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      statusCode: 401,
    })
    expect(mockDbQuery.tenants.findFirst).not.toHaveBeenCalled()
  })
})
