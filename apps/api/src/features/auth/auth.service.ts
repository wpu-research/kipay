import { db, users, sessions, tenants, eq, and, isNull, gt, ne } from '@panel/db'
import * as argon2 from 'argon2'
import { authenticator } from 'otplib'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { AppError } from '../../errors/app-error.js'
import { env } from '../../config/env.js'
import type { JwtPayload } from '@panel/types'
import type { Session } from '@panel/db'

// P-14: TOTP için 1 pencere toleransı (30 sn saat kaymasına izin verir)
authenticator.options = { window: 1 }

// P-02: Timing attack koruması için geçerli dummy hash (lazy init, tek seferlik)
// P-05 fix: hash başarısız olursa promise sıfırlanır; sonraki çağrıda yeniden denenir
let _dummyHashPromise: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  if (!_dummyHashPromise) {
    _dummyHashPromise = argon2.hash('__panel_dummy_timing_hash__').catch((err) => {
      _dummyHashPromise = null
      throw err
    })
  }
  return _dummyHashPromise
}

function encryptTotpSecret(secret: string): string {
  const key = Buffer.from(env.TOTP_ENCRYPTION_KEY, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptTotpSecret(encryptedSecret: string): string {
  try {
    const key = Buffer.from(env.TOTP_ENCRYPTION_KEY, 'hex')
    const parts = encryptedSecret.split(':')
    if (parts.length !== 3) throw new Error('Malformed')
    const [ivHex, tagHex, encHex] = parts as [string, string, string]
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return decipher.update(Buffer.from(encHex, 'hex')).toString('utf8') + decipher.final('utf8')
  } catch {
    throw new AppError('INVALID_CREDENTIALS', 'Geçersiz kullanıcı adı veya şifre.', 401)
  }
}

export const authService = {
  encryptTotpSecret,

  // Adım 1: Kullanıcı adı + şifre doğrulama
  async validateCredentials(username: string, password: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
    })

    // Güvenlik: kullanıcı bulunamasa da tam argon2 hesabı yaparak timing attack önle
    // P-3: getDummyHash() veya verify() fırlatırsa try/catch ile yutulur; 500 sızdırmaz
    if (!user) {
      try {
        await argon2.verify(await getDummyHash(), password)
      } catch {
        // timing için yapılan sahte doğrulama — hata yutulur
      }
      throw new AppError('INVALID_CREDENTIALS', 'Geçersiz kullanıcı adı veya şifre.', 401)
    }

    // [CR-4 Fix Medium] Block kontrolü şifre verify'dan önce — AC-4 sözleşmesi: engelli kullanıcı
    // yanlış şifre girseydi de USER_BLOCKED almalı (INVALID_CREDENTIALS değil).
    if (user.isPermanentlyBlocked || (user.blockedUntil && user.blockedUntil > new Date())) {
      throw new AppError(
        'USER_BLOCKED',
        'Hesap engellenmiş.',
        403,
        { blockedUntil: user.isPermanentlyBlocked ? null : user.blockedUntil?.toISOString() ?? null },
      )
    }

    const valid = await argon2.verify(user.passwordHash, password)
    if (!valid) {
      throw new AppError('INVALID_CREDENTIALS', 'Geçersiz kullanıcı adı veya şifre.', 401)
    }

    // BS-4 (kabul edildi): pasif kullanıcı şifre doğrulandıktan sonra USER_INACTIVE döner.
    if (user.status === 'inactive') {
      throw new AppError('USER_INACTIVE', 'Kullanıcı hesabı pasif.', 403)
    }

    // super_admin global yönetici — tenant'a bağlı değil, tenant kontrolü atlanır
    if (user.role !== 'super_admin') {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, user.tenantId),
      })

      if (!tenant || tenant.status === 'inactive') {
        throw new AppError('TENANT_INACTIVE', 'Tenant aktif değil.', 403)
      }
    }

    return user
  },

  // Adım 2: TOTP kodu doğrulama
  // P-03 fix: şifre çözme hatası da INVALID_2FA_CODE olarak döner (INVALID_CREDENTIALS değil)
  validateTotp(encryptedSecret: string, code: string) {
    let secret: string
    try {
      secret = decryptTotpSecret(encryptedSecret)
    } catch {
      throw new AppError('INVALID_2FA_CODE', 'Geçersiz 2FA kodu.', 401)
    }
    const valid = authenticator.verify({ token: code, secret })
    if (!valid) {
      throw new AppError('INVALID_2FA_CODE', 'Geçersiz 2FA kodu.', 401)
    }
  },

  // JWT payload builder
  buildJwtPayload(user: { id: string; username: string; role: string; tenantId: string }, sessionId: string): JwtPayload {
    return {
      userId: user.id,
      username: user.username,
      role: user.role as JwtPayload['role'],
      tenantId: user.tenantId,
      sessionId,
    }
  },

  // Oturum oluştur (2FA verify sonrasında)
  // P-7: session! yerine explicit null kontrolü
  async createSession(userId: string, ip: string, userAgent: string): Promise<Session> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 gün
    const [session] = await db.insert(sessions).values({ userId, ip, userAgent, expiresAt }).returning()
    if (!session) throw new AppError('INTERNAL_ERROR', 'Oturum oluşturulamadı.', 500)
    return session
  },

  // Kullanıcının aktif oturumlarını listele
  async getSessions(userId: string): Promise<Session[]> {
    const now = new Date()
    return db.query.sessions.findMany({
      where: and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
      orderBy: (s, { desc }) => [desc(s.createdAt)],
    })
  },

  // Belirli bir oturumu iptal et
  // P-1: zaten revoke edilmişse idempotent dön; WHERE'e isNull guard ekle
  // P-10: önce varlık (404), sonra sahiplik (403) kontrolü — AC4'e uygun
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) })
    if (!session) {
      throw new AppError('NOT_FOUND', 'Oturum bulunamadı.', 404)
    }
    if (session.userId !== userId) {
      throw new AppError('FORBIDDEN', 'Bu oturuma erişim yetkiniz yok.', 403)
    }
    if (session.revokedAt) return // idempotent: zaten iptal edilmiş
    await db.update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
  },

  // Mevcut oturum hariç tüm oturumları iptal et
  // P-9: boş currentSessionId guard — tüm session'ların silinmesini önler
  async revokeAllSessionsExcept(userId: string, currentSessionId: string): Promise<void> {
    if (!currentSessionId) {
      throw new AppError('INTERNAL_ERROR', 'Geçerli oturum kimliği gerekli.', 500)
    }
    await db.update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        ne(sessions.id, currentSessionId),
      ))
  },

  // Tüm oturumları iptal et (şifre değiştirme için)
  async revokeAllSessions(userId: string): Promise<void> {
    await db.update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
  },

  // Şifre değiştir ve tüm oturumları geçersiz kıl
  // P-2: transaction — password update ve session revoke atomik
  // BS-3 (kabul edildi): mevcut access token'ın kalan ömrü (~15 dk) stateless JWT kısıtı gereği
  //   geçerli kalır; ancak şifre değişikliği tüm oturumları revoke ederek refresh'i engeller.
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user) throw new AppError('UNAUTHORIZED', 'Kullanıcı bulunamadı.', 401)

    const valid = await argon2.verify(user.passwordHash, currentPassword)
    if (!valid) throw new AppError('INVALID_CURRENT_PASSWORD', 'Mevcut şifre hatalı.', 400)

    const newHash = await argon2.hash(newPassword)
    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, userId))
      await tx.update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    })
  },

  // P-5: /refresh endpoint için service-layer session doğrulaması
  async validateActiveSession(sessionId: string): Promise<Session> {
    const session = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    })
    if (!session) throw new AppError('UNAUTHORIZED', 'Oturum geçersiz kılınmış.', 401)
    return session
  },
}
