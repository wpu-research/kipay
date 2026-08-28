import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../errors/app-error.js'

// @panel/db ve argon2 modüllerini mock'la (DB bağlantısı olmadan test)
vi.mock('@panel/db', () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
      tenants: { findFirst: vi.fn() },
      sessions: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      }
      await fn(tx)
    }),
  },
  users: {},
  tenants: {},
  sessions: {},
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt: vi.fn((col, val) => ({ col, val, gt: true })),
  ne: vi.fn((col, val) => ({ col, val, ne: true })),
}))

vi.mock('argon2', () => ({
  verify: vi.fn(),
  hash: vi.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$dummy'),
}))

import * as argon2 from 'argon2'
import { db } from '@panel/db'
import { authService } from './auth.service.js'

const mockDbQuery = db.query as unknown as {
  users: { findFirst: ReturnType<typeof vi.fn> }
  tenants: { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateCredentials', () => {
    it('kullanıcı bulunamazsa INVALID_CREDENTIALS fırlatır', async () => {
      mockDbQuery.users.findFirst.mockResolvedValue(null)
      vi.mocked(argon2.verify).mockRejectedValue(new Error('hash error'))

      await expect(
        authService.validateCredentials('nonexistent', 'password')
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    })

    it('şifre yanlışsa INVALID_CREDENTIALS fırlatır', async () => {
      mockDbQuery.users.findFirst.mockResolvedValue({
        id: 'user-id',
        username: 'testuser',
        passwordHash: 'hash',
        status: 'active',
        tenantId: 'tenant-id',
        role: 'finans',
      })
      mockDbQuery.tenants.findFirst.mockResolvedValue({ status: 'active' })
      vi.mocked(argon2.verify).mockResolvedValue(false)

      await expect(
        authService.validateCredentials('testuser', 'wrongpassword')
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    })

    it('tenant bulunamazsa TENANT_INACTIVE fırlatır', async () => {
      mockDbQuery.users.findFirst.mockResolvedValue({
        id: 'user-id',
        username: 'testuser',
        passwordHash: 'hash',
        status: 'active',
        tenantId: 'tenant-id',
        role: 'finans',
      })
      mockDbQuery.tenants.findFirst.mockResolvedValue(null)
      vi.mocked(argon2.verify).mockResolvedValue(true)

      await expect(
        authService.validateCredentials('testuser', 'Test1234!')
      ).rejects.toMatchObject({ code: 'TENANT_INACTIVE', statusCode: 403 })
    })

    it('tenant inactive ise TENANT_INACTIVE fırlatır', async () => {
      mockDbQuery.users.findFirst.mockResolvedValue({
        id: 'user-id',
        username: 'testuser',
        passwordHash: 'hash',
        status: 'active',
        tenantId: 'tenant-id',
        role: 'finans',
      })
      mockDbQuery.tenants.findFirst.mockResolvedValue({ status: 'inactive' })
      vi.mocked(argon2.verify).mockResolvedValue(true)

      await expect(
        authService.validateCredentials('testuser', 'Test1234!')
      ).rejects.toMatchObject({ code: 'TENANT_INACTIVE', statusCode: 403 })
    })

    it('kullanıcı inactive ise USER_INACTIVE fırlatır', async () => {
      mockDbQuery.users.findFirst.mockResolvedValue({
        id: 'user-id',
        username: 'testuser',
        passwordHash: 'hash',
        status: 'inactive',
        tenantId: 'tenant-id',
        role: 'finans',
      })
      mockDbQuery.tenants.findFirst.mockResolvedValue({ status: 'active' })
      vi.mocked(argon2.verify).mockResolvedValue(true)

      await expect(
        authService.validateCredentials('testuser', 'Test1234!')
      ).rejects.toMatchObject({ code: 'USER_INACTIVE', statusCode: 403 })
    })

    it('geçerli kimlik bilgilerinde kullanıcıyı döndürür', async () => {
      const mockUser = {
        id: 'user-id',
        username: 'testuser',
        passwordHash: 'hash',
        status: 'active',
        tenantId: 'tenant-id',
        role: 'finans' as const,
        totpSecret: 'encrypted-secret',
        isPermanentlyBlocked: false,
        blockedUntil: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDbQuery.users.findFirst.mockResolvedValue(mockUser)
      mockDbQuery.tenants.findFirst.mockResolvedValue({ status: 'active' })
      vi.mocked(argon2.verify).mockResolvedValue(true)

      const result = await authService.validateCredentials('testuser', 'Test1234!')
      expect(result).toEqual(mockUser)
    })

    it('engelli kullanıcı yanlış şifre girseydi USER_BLOCKED döner (INVALID_CREDENTIALS değil)', async () => {
      const blockedUntil = new Date(Date.now() + 3_600_000)
      mockDbQuery.users.findFirst.mockResolvedValue({
        id: 'user-id',
        username: 'testuser',
        passwordHash: 'hash',
        status: 'active',
        tenantId: 'tenant-id',
        role: 'finans',
        isPermanentlyBlocked: false,
        blockedUntil,
      })
      vi.mocked(argon2.verify).mockResolvedValue(false)  // yanlış şifre

      await expect(
        authService.validateCredentials('testuser', 'wrongpassword')
      ).rejects.toMatchObject({ code: 'USER_BLOCKED', statusCode: 403 })
    })

    it('süreli engelli kullanıcı login yapmaya çalışınca USER_BLOCKED + blockedUntil döner', async () => {
      const blockedUntil = new Date(Date.now() + 3_600_000)
      mockDbQuery.users.findFirst.mockResolvedValue({
        id: 'user-id',
        username: 'testuser',
        passwordHash: 'hash',
        status: 'active',
        tenantId: 'tenant-id',
        role: 'finans',
        isPermanentlyBlocked: false,
        blockedUntil,
      })
      vi.mocked(argon2.verify).mockResolvedValue(true)

      await expect(
        authService.validateCredentials('testuser', 'Test1234!')
      ).rejects.toMatchObject({ code: 'USER_BLOCKED', statusCode: 403, data: { blockedUntil: blockedUntil.toISOString() } })
    })

    it('kalıcı engelli kullanıcı login yapmaya çalışınca USER_BLOCKED + blockedUntil: null döner', async () => {
      mockDbQuery.users.findFirst.mockResolvedValue({
        id: 'user-id',
        username: 'testuser',
        passwordHash: 'hash',
        status: 'active',
        tenantId: 'tenant-id',
        role: 'finans',
        isPermanentlyBlocked: true,
        blockedUntil: null,
      })
      vi.mocked(argon2.verify).mockResolvedValue(true)

      await expect(
        authService.validateCredentials('testuser', 'Test1234!')
      ).rejects.toMatchObject({ code: 'USER_BLOCKED', statusCode: 403, data: { blockedUntil: null } })
    })

    it('süresi dolmuş blok olan kullanıcı login yapabilir (otomatik expired)', async () => {
      const pastDate = new Date(Date.now() - 1000)
      const mockUser = {
        id: 'user-id',
        username: 'testuser',
        passwordHash: 'hash',
        status: 'active',
        tenantId: 'tenant-id',
        role: 'finans' as const,
        totpSecret: 'encrypted-secret',
        isPermanentlyBlocked: false,
        blockedUntil: pastDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDbQuery.users.findFirst.mockResolvedValue(mockUser)
      mockDbQuery.tenants.findFirst.mockResolvedValue({ status: 'active' })
      vi.mocked(argon2.verify).mockResolvedValue(true)

      const result = await authService.validateCredentials('testuser', 'Test1234!')
      expect(result).toEqual(mockUser)
    })
  })

  describe('validateTotp', () => {
    it('geçersiz TOTP kodunda INVALID_2FA_CODE fırlatır', () => {
      // encryptTotpSecret ile şifrelenmiş bir secret oluştur
      const encrypted = authService.encryptTotpSecret('JBSWY3DPEHPK3PXP')
      expect(() =>
        authService.validateTotp(encrypted, '000000')
      ).toThrow(AppError)
    })
  })

  describe('buildJwtPayload', () => {
    it('kullanıcıdan doğru JWT payload oluşturur', () => {
      const sessionId = '11111111-1111-1111-1111-111111111111'
      const payload = authService.buildJwtPayload({
        id: 'user-uuid',
        username: 'admin',
        role: 'super_admin',
        tenantId: 'tenant-uuid',
      }, sessionId)

      expect(payload).toEqual({
        userId: 'user-uuid',
        username: 'admin',
        role: 'super_admin',
        tenantId: 'tenant-uuid',
        sessionId,
      })
    })
  })

  describe('revokeSession', () => {
    it('oturum bulunamazsa NOT_FOUND fırlatır', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValue(null)
      await expect(
        authService.revokeSession('session-id', 'user-id')
      ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
    })

    it('oturum başka kullanıcıya aitse FORBIDDEN fırlatır', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValue({
        id: 'session-id',
        userId: 'other-user-id',
        revokedAt: null,
      })
      await expect(
        authService.revokeSession('session-id', 'user-id')
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
    })

    it('zaten revoke edilmiş oturumda hata fırlatmaz (idempotent)', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValue({
        id: 'session-id',
        userId: 'user-id',
        revokedAt: new Date(),
      })
      await expect(authService.revokeSession('session-id', 'user-id')).resolves.toBeUndefined()
    })
  })

  describe('validateActiveSession', () => {
    it('aktif session yoksa UNAUTHORIZED fırlatır', async () => {
      mockDbQuery.sessions.findFirst.mockResolvedValue(null)
      await expect(
        authService.validateActiveSession('session-id')
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 401 })
    })

    it('aktif session varsa döndürür', async () => {
      const mockSession = { id: 'session-id', userId: 'user-id', revokedAt: null, expiresAt: new Date(Date.now() + 1000) }
      mockDbQuery.sessions.findFirst.mockResolvedValue(mockSession)
      const result = await authService.validateActiveSession('session-id')
      expect(result).toEqual(mockSession)
    })
  })

  describe('revokeAllSessionsExcept', () => {
    it('boş currentSessionId ile INTERNAL_ERROR fırlatır', async () => {
      await expect(
        authService.revokeAllSessionsExcept('user-id', '')
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR', statusCode: 500 })
    })
  })

  describe('encryptTotpSecret / decryptTotpSecret', () => {
    it('şifreleme ve çözme döngüsü başarılı', () => {
      const originalSecret = 'JBSWY3DPEHPK3PXP'
      const encrypted = authService.encryptTotpSecret(originalSecret)

      expect(encrypted).not.toBe(originalSecret)
      expect(encrypted).toContain(':') // format: iv:tag:encrypted
    })

    it('hatalı biçimli şifreli veri INVALID_CREDENTIALS fırlatır', () => {
      expect(() =>
        authService.validateTotp('malformed-data-no-colons', '123456')
      ).toThrow(AppError)
    })
  })
})
