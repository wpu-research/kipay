import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { db, users, sessions, tenants, eq, and, isNull } from '@panel/db'
import {
  LoginSchema,
  TwoFactorVerifySchema,
  LoginResponseSchema,
  VerifyResponseSchema,
  MeResponseSchema,
  ChangePasswordSchema,
  SessionListResponseSchema,
  MasqueradeResponseSchema,
} from '@panel/types'
import type { JwtPayload } from '@panel/types'
import { authService } from './auth.service.js'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'
import { env } from '../../config/env.js'

// Cookie domain: subdomain'ler arası paylaşım için (örn. api. ve panel. aynı domain'de)
function getCookieDomain(): string | undefined {
  try {
    const url = new URL(env.FRONTEND_URL)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return undefined
    // IP adresleri için domain attribute set etme — .0.111 gibi geçersiz domain üretir
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) return undefined
    const parts = url.hostname.split('.')
    return parts.length >= 2 ? `.${parts.slice(-2).join('.')}` : undefined
  } catch { return undefined }
}
const COOKIE_DOMAIN = getCookieDomain()

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /login — Rate limit: 5/5dk per IP
  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    schema: {
      tags: ['Auth'],
      summary: 'Giriş yap',
      body: LoginSchema,
      response: { 200: LoginResponseSchema },
    },
  }, async (request, reply) => {
    const { username, password } = request.body
    const user = await authService.validateCredentials(username, password)

    if (!user.totpSecret) {
      // 2FA devre dışı — doğrudan session oluştur
      const { session, lockedUser } = await db.transaction(async (tx) => {
        const [locked] = await tx.select().from(users).where(eq(users.id, user.id)).for('update').limit(1)
        if (!locked) throw new AppError('INTERNAL_ERROR', 'Kullanıcı bulunamadı.', 500)

        await tx.update(sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)))

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        const [newSession] = await tx.insert(sessions).values({
          userId: user.id,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
          expiresAt,
        }).returning()
        if (!newSession) throw new AppError('INTERNAL_ERROR', 'Oturum oluşturulamadı.', 500)
        return { session: newSession, lockedUser: locked }
      })

      const isProduction = env.NODE_ENV === 'production'
      const cookieDefaults = { httpOnly: true, sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax', secure: isProduction, ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}) }
      const accessToken = app.jwt.sign(authService.buildJwtPayload(lockedUser, session.id), { expiresIn: '15m' })
      const refreshToken = jwt.sign(
        { userId: lockedUser.id, sessionId: session.id, type: 'refresh' },
        env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' },
      )

      reply.setCookie('access_token', accessToken, { ...cookieDefaults, path: '/', maxAge: 15 * 60 })
      reply.setCookie('refresh_token', refreshToken, { ...cookieDefaults, maxAge: 7 * 24 * 60 * 60, path: '/api/v1/auth/refresh' })

      return {
        status: 'LOGGED_IN' as const,
        user: { id: lockedUser.id, username: lockedUser.username, role: lockedUser.role, tenantId: lockedUser.tenantId },
      }
    }

    // BS-1 fix: tempToken httpOnly cookie olarak set edilir (sessionStorage değil)
    // P-05 fix: JWT_TEMP_SECRET kullanılır (access_token secret'ından farklı)
    const tempToken = jwt.sign(
      { userId: user.id, step: '2fa' },
      env.JWT_TEMP_SECRET,
      { expiresIn: '5m' },
    )

    reply.setCookie('temp_token', tempToken, {
      httpOnly: true,
      sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/api/v1/auth/2fa/verify',
      maxAge: 5 * 60,
      ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    })

    return { status: '2FA_REQUIRED' as const }
  })

  // POST /2fa/verify
  // P-01 fix: Rate limit eklendi (5/5dk per IP)
  app.post('/2fa/verify', {
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    schema: {
      tags: ['Auth'],
      summary: '2FA kodu doğrula',
      body: TwoFactorVerifySchema,
      response: { 200: VerifyResponseSchema },
    },
  }, async (request, reply) => {
    const { code } = request.body

    // BS-1 fix: tempToken cookie'den okunur
    const tempToken = request.cookies['temp_token']
    if (!tempToken) throw new AppError('INVALID_TEMP_TOKEN', 'Temp token bulunamadı.', 401)

    // P-05 fix: JWT_TEMP_SECRET ile doğrula
    let tempPayload: jwt.JwtPayload
    try {
      const decoded = jwt.verify(tempToken, env.JWT_TEMP_SECRET)
      if (typeof decoded === 'string') throw new Error('Geçersiz payload')
      tempPayload = decoded
    } catch {
      throw new AppError('INVALID_TEMP_TOKEN', 'Geçersiz veya süresi dolmuş token.', 401)
    }

    if (tempPayload['step'] !== '2fa') {
      throw new AppError('INVALID_TEMP_TOKEN', 'Geçersiz token tipi.', 401)
    }

    const userId = tempPayload['userId'] as string
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })
    if (!user) throw new AppError('INVALID_TEMP_TOKEN', 'Kullanıcı bulunamadı.', 401)

    // [CR-3 Fix Medium] Block kontrolü inactive'den önce — USER_BLOCKED sözleşmesi öncelikli
    if (user.isPermanentlyBlocked || (user.blockedUntil && user.blockedUntil > new Date())) {
      throw new AppError(
        'USER_BLOCKED',
        'Hesap engellenmiş.',
        403,
        { blockedUntil: user.isPermanentlyBlocked ? null : user.blockedUntil?.toISOString() ?? null },
      )
    }

    // P-07: Sıra önemli — önce kullanıcı, sonra tenant, en son TOTP (bilgi sızdırmama)
    if (user.status === 'inactive') {
      throw new AppError('USER_INACTIVE', 'Kullanıcı hesabı pasif.', 403)
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, user.tenantId),
    })
    // P-06: tenant null ise de reddet (optional chaining değil, explicit null kontrolü)
    if (!tenant || tenant.status === 'inactive') {
      throw new AppError('TENANT_INACTIVE', 'Tenant aktif değil.', 403)
    }

    // totpSecret null ise bu kullanıcı 2FA'yı henüz kurmamış — INVALID_2FA_CODE döner
    if (!user.totpSecret) {
      throw new AppError('INVALID_2FA_CODE', 'Geçersiz 2FA kodu.', 401)
    }
    authService.validateTotp(user.totpSecret, code)

    // [CR-2 Fix High] Atomik garanti: SELECT FOR UPDATE ile kullanıcı satırı kilitlenir.
    // blockUser'ın UPDATE'i, bu transaction tamamlanana kadar beklemek zorundadır.
    // Böylece TOTP doğrulaması ile session oluşturma arasındaki yarış penceresi kapatılır.
    // [CR-5 Fix High] lockedUser transaction'dan döndürülür — token ve response stale snapshot'tan değil güncel satırdan üretilir.
    const { session, lockedUser } = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(users).where(eq(users.id, userId)).for('update').limit(1)
      if (!locked) throw new AppError('INVALID_TEMP_TOKEN', 'Kullanıcı bulunamadı.', 401)

      // [CR-3 Fix High] Transaction içinde block/status/tenant yeniden doğrula (FOR UPDATE sonrası güncel değerler)
      if (locked.isPermanentlyBlocked || (locked.blockedUntil && locked.blockedUntil > new Date())) {
        throw new AppError(
          'USER_BLOCKED',
          'Hesap engellenmiş.',
          403,
          { blockedUntil: locked.isPermanentlyBlocked ? null : locked.blockedUntil?.toISOString() ?? null },
        )
      }

      if (locked.status === 'inactive') {
        throw new AppError('USER_INACTIVE', 'Kullanıcı hesabı pasif.', 403)
      }

      // [CR-4 Fix High] Tenant satırı da kilitlenir — yarışan inactive geçişini atomik garantiye alır
      const [lockedTenant] = await tx.select({ status: tenants.status })
        .from(tenants).where(eq(tenants.id, locked.tenantId)).for('update').limit(1)
      if (!lockedTenant || lockedTenant.status === 'inactive') {
        throw new AppError('TENANT_INACTIVE', 'Tenant aktif değil.', 403)
      }

      // ADR-AUTH-001: Tek session politikası — yeni giriş öncesi önceki oturumları kapat
      await tx.update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))

      // Session oluştur
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const [newSession] = await tx.insert(sessions).values({
        userId,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
        expiresAt,
      }).returning()
      if (!newSession) throw new AppError('INTERNAL_ERROR', 'Oturum oluşturulamadı.', 500)
      return { session: newSession, lockedUser: locked }
    })

    // P-11: accessToken @fastify/jwt, refreshToken ve tempToken raw jsonwebtoken ile imzalanıyor.
    // Access token (15 dakika) — @fastify/jwt ile (JWT_SECRET), sessionId dahil
    // lockedUser kullanılır: transaction içinde kilitlenmiş güncel satır
    const accessToken = app.jwt.sign(authService.buildJwtPayload(lockedUser, session.id), { expiresIn: '15m' })
    // Refresh token (7 gün) — ADR-AUTH-001: sessionId eklendi (spesifik session doğrulaması için)
    const refreshToken = jwt.sign(
      { userId: lockedUser.id, sessionId: session.id, type: 'refresh' },
      env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' },
    )

    const isProduction = env.NODE_ENV === 'production'
    const cookieDefaults = {
      httpOnly: true,
      sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      secure: isProduction,
      ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    }

    // Tek kullanımlık temp_token cookie'yi temizle
    // P-12 fix: secure flag eklendi (setCookie ile tutarlı)
    reply.clearCookie('temp_token', {
      path: '/api/v1/auth/2fa/verify',
      httpOnly: true,
      sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      secure: isProduction,
      ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    })

    reply.setCookie('access_token', accessToken, { ...cookieDefaults, path: '/', maxAge: 15 * 60 })
    reply.setCookie('refresh_token', refreshToken, {
      ...cookieDefaults,
      maxAge: 7 * 24 * 60 * 60,
      path: '/api/v1/auth/refresh',
    })

    return {
      user: {
        id: lockedUser.id,
        username: lockedUser.username,
        role: lockedUser.role,
        tenantId: lockedUser.tenantId,
      },
    }
  })

  // POST /refresh
  // P-08: Rate limit eklendi (brute-force token yenileme saldırısı önleme)
  app.post('/refresh', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    schema: { tags: ['Auth'], summary: 'Access token yenile', response: { 200: z.object({ success: z.boolean() }) } },
  }, async (request, reply) => {
    const refreshToken = request.cookies['refresh_token']
    if (!refreshToken) throw new AppError('UNAUTHORIZED', 'Refresh token bulunamadı.', 401)

    let payload: jwt.JwtPayload
    try {
      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET)
      if (typeof decoded === 'string') throw new Error('Geçersiz payload')
      payload = decoded
    } catch {
      throw new AppError('UNAUTHORIZED', 'Geçersiz refresh token.', 401)
    }

    if (payload['type'] !== 'refresh') throw new AppError('UNAUTHORIZED', 'Geçersiz token tipi.', 401)

    // ADR-AUTH-001: refresh token'daki sessionId ile spesifik session doğrula
    // P-5: session doğrulaması service layer'a taşındı
    const sessionId = payload['sessionId'] as string | undefined
    if (!sessionId) throw new AppError('UNAUTHORIZED', 'Geçersiz refresh token.', 401)

    const userId = payload['userId'] as string
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user || user.status === 'inactive') throw new AppError('UNAUTHORIZED', 'Kullanıcı bulunamadı.', 401)

    // P-10: Tenant durumunu da kontrol et (tenant deaktive olunca token yenilenmemeli)
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, user.tenantId) })
    if (!tenant || tenant.status === 'inactive') throw new AppError('UNAUTHORIZED', 'Tenant aktif değil.', 401)

    // Session geçerliliğini kontrol et — revoke veya süresi dolmuşsa 401 döner
    const activeSession = await authService.validateActiveSession(sessionId)

    const newAccessToken = app.jwt.sign(authService.buildJwtPayload(user, activeSession.id), { expiresIn: '15m' })
    reply.setCookie('access_token', newAccessToken, {
      httpOnly: true,
      sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 15 * 60,
      ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    })

    return { success: true }
  })

  // POST /logout (authenticate preHandler ile session revoke)
  // Not: authenticate opsiyonel — süresi dolmuş token'la da cookie temizlenebilmeli
  app.post('/logout', {
    schema: { tags: ['Auth'], summary: 'Çıkış yap', response: { 200: z.object({ success: z.boolean() }) } },
  }, async (request, reply) => {
    // Mevcut session varsa revoke et
    try {
      await request.jwtVerify()
      const sessionId = request.user?.sessionId
      if (sessionId) {
        await db.update(sessions)
          .set({ revokedAt: new Date() })
          .where(eq(sessions.id, sessionId))
      }
    } catch {
      // Token geçersiz veya süresi dolmuş — sadece cookie temizle, hata fırlatma
    }

    const isProduction = env.NODE_ENV === 'production'
    const clearOpts = { httpOnly: true, sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax', secure: isProduction, ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}) }
    reply.clearCookie('access_token', { ...clearOpts, path: '/' })
    reply.clearCookie('refresh_token', { ...clearOpts, path: '/api/v1/auth/refresh' })
    // P-11 fix: akış ortasında logout yapılırsa temp_token da temizlenir
    reply.clearCookie('temp_token', { ...clearOpts, path: '/api/v1/auth/2fa/verify' })
    return { success: true }
  })

  // GET /me (korumalı)
  app.get('/me', {
    preHandler: [authenticate],
    schema: { tags: ['Auth'], summary: 'Mevcut kullanıcı bilgisi', response: { 200: MeResponseSchema } },
  }, async (request) => {
    const { userId, username, role, tenantId, masquerading, originalUserId } = request.user
    return { user: { id: userId, username, role, tenantId, masquerading, originalUserId } }
  })

  // POST /masquerade/exit — Masquerade'den çık (AC: 3)
  // NOT: /masquerade/:userId'den ÖNCE kayıtlı olmalı (Fastify statik route önce eşleştirir)
  app.post('/masquerade/exit', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Masquerade\'den çık',
      response: { 200: z.object({ success: z.boolean() }) },
    },
  }, async (request, reply) => {
    const caller = request.user

    if (!caller.masquerading || !caller.originalUserId) {
      throw new AppError('FORBIDDEN', 'Masquerade modunda değilsiniz.', 403)
    }

    // P-2: Session geçerliliğini önce kontrol et — geçersizse DB sorgusuna gerek yok
    const originalSession = await authService.validateActiveSession(caller.sessionId)

    // Orijinal super admin'i bul
    const originalUser = await db.query.users.findFirst({ where: eq(users.id, caller.originalUserId) })
    if (!originalUser) throw new AppError('UNAUTHORIZED', 'Orijinal kullanıcı bulunamadı.', 401)
    if (originalUser.status === 'inactive') throw new AppError('UNAUTHORIZED', 'Orijinal kullanıcı pasif.', 401)

    // Orijinal super admin access token'ı yeniden üret
    const restoredPayload = authService.buildJwtPayload(originalUser, originalSession.id)
    const restoredToken = app.jwt.sign(restoredPayload, { expiresIn: '15m' })

    reply.setCookie('access_token', restoredToken, {
      httpOnly: true,
      sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 15 * 60,
      ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    })

    // P-1: Audit log — actorUsername orijinal super admin'in adı; caller.username masquerade edilen kullanıcıya ait
    request.log.info({
      event: 'masquerade.exit',
      actorId: caller.originalUserId,
      actorUsername: originalUser.username,
      masqueradedAs: caller.userId,
      masqueradedAsUsername: caller.username,
      sessionId: caller.sessionId,
      timestamp: new Date().toISOString(),
    }, `Masquerade sonlandı: ${originalUser.username} → orijinal oturuma dönüldü`)

    return { success: true }
  })

  // POST /masquerade/:userId — Super admin only (AC: 1, 2, 5, 6)
  // Rate limit: 10 istek / 15 dakika (masquerade abuse koruması)
  app.post('/masquerade/:userId', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Auth'],
      summary: 'Kullanıcıya masquerade yap',
      params: z.object({ userId: z.string().uuid() }),
      response: { 200: MasqueradeResponseSchema },
    },
  }, async (request, reply) => {
    const caller = request.user

    // AC-6: Sadece super_admin masquerade yapabilir
    if (caller.role !== 'super_admin') {
      throw new AppError('FORBIDDEN', 'Bu işlem yalnızca super admin yetkisiyle yapılabilir.', 403)
    }

    // AC-5: Zaten masquerade modundaysa nested masquerade yok
    if (caller.masquerading) {
      throw new AppError('MASQUERADE_NESTED_FORBIDDEN', 'Masquerade modundayken başka bir kullanıcıya masquerade yapılamaz.', 403)
    }

    const { userId: targetUserId } = request.params

    // Kendi kendine masquerade anlamsız
    if (targetUserId === caller.userId) {
      throw new AppError('FORBIDDEN', 'Kendinize masquerade yapamazsınız.', 403)
    }

    // Hedef kullanıcıyı bul
    const targetUser = await db.query.users.findFirst({ where: eq(users.id, targetUserId) })
    if (!targetUser) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.', 404)
    if (targetUser.status === 'inactive') throw new AppError('USER_INACTIVE', 'Hedef kullanıcı pasif.', 403)

    // G-IG1: Super admin'e masquerade yasak (IG-1 kapanışı)
    if (targetUser.role === 'super_admin') {
      throw new AppError('FORBIDDEN', 'Super admin kullanıcısına masquerade yapılamaz.', 403)
    }

    // Masquerade access token üret (1 saat)
    // sessionId: orijinal super admin session'ı (exit için gerekli)
    const masqueradePayload: JwtPayload = {
      userId:         targetUser.id,
      username:       targetUser.username,
      role:           targetUser.role as JwtPayload['role'],
      tenantId:       targetUser.tenantId,
      sessionId:      caller.sessionId,
      masquerading:   true,
      originalUserId: caller.userId,
    }
    const masqueradeToken = app.jwt.sign(masqueradePayload, { expiresIn: '1h' })

    reply.setCookie('access_token', masqueradeToken, {
      httpOnly: true,
      sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60,
      ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    })

    // Audit log (uygulama logu — Story 6.3'te DB'ye taşınacak)
    request.log.info({
      event: 'masquerade.start',
      actorId: caller.userId,
      actorUsername: caller.username,
      targetId: targetUser.id,
      targetUsername: targetUser.username,
      targetRole: targetUser.role,
      sessionId: caller.sessionId,
      timestamp: new Date().toISOString(),
    }, `Masquerade başladı: ${caller.username} → ${targetUser.username} (${targetUser.role})`)

    return {
      success: true,
      targetUser: {
        id:       targetUser.id,
        username: targetUser.username,
        role:     targetUser.role as JwtPayload['role'],
      },
    }
  })

  // PUT /password — Şifre değiştir (tüm oturumları geçersiz kılar)
  // P-6: brute-force koruması için rate limit eklendi
  app.put('/password', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Auth'],
      summary: 'Şifre değiştir',
      body: ChangePasswordSchema,
      response: { 200: z.object({ success: z.boolean() }) },
    },
  }, async (request) => {
    const { currentPassword, newPassword } = request.body
    await authService.changePassword(request.user.userId, currentPassword, newPassword)
    return { success: true }
  })

  // GET /sessions — Aktif oturumları listele
  app.get('/sessions', {
    preHandler: [authenticate],
    schema: { tags: ['Auth'], summary: 'Aktif oturumları listele', response: { 200: SessionListResponseSchema } },
  }, async (request) => {
    const activeSessions = await authService.getSessions(request.user.userId)
    const currentSessionId = request.user.sessionId
    return {
      data: activeSessions.map(s => ({
        id: s.id,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
        current: s.id === currentSessionId,
      })),
    }
  })

  // DELETE /sessions/:sessionId — Belirli oturumu sonlandır
  app.delete('/sessions/:sessionId', {
    preHandler: [authenticate],
    schema: {
      tags: ['Auth'],
      summary: 'Oturumu sonlandır',
      params: z.object({ sessionId: z.string().uuid() }),
      response: { 200: z.object({ success: z.boolean() }) },
    },
  }, async (request) => {
    const { sessionId } = request.params
    await authService.revokeSession(sessionId, request.user.userId)
    return { success: true }
  })

  // ADR-AUTH-001: DELETE /sessions (bulk) endpoint'i kaldırıldı.
  // Tek session politikasıyla anlamsız hale geldi; her yeni girişte önceki session revoke edilir.
}
