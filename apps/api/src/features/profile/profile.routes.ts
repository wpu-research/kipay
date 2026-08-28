import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { authenticator } from 'otplib'
import { db, users, eq } from '@panel/db'
import { authenticate } from '../../middleware/auth.js'
import { authService } from '../auth/auth.service.js'
import { AppError } from '../../errors/app-error.js'
import { env } from '../../config/env.js'

export const profileRoutes: FastifyPluginAsyncZod = async (app) => {

  // GET /profile/2fa — 2FA durumu
  app.get('/2fa', {
    preHandler: [authenticate],
    schema: {
      tags: ['Profile'],
      summary: '2FA durumu',
      response: { 200: z.object({ enabled: z.boolean() }) },
    },
  }, async (request) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, request.user.userId) })
    return { enabled: !!user?.totpSecret }
  })

  // POST /profile/2fa/setup — Yeni TOTP secret üret, QR kodu döndür (henüz kaydetme)
  app.post('/2fa/setup', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    schema: {
      tags: ['Profile'],
      summary: '2FA kurulum başlat',
      response: { 200: z.object({ totpUri: z.string(), setupToken: z.string() }) },
    },
  }, async (request) => {
    const rawSecret = authenticator.generateSecret()
    const encryptedSecret = authService.encryptTotpSecret(rawSecret)
    const totpUri = authenticator.keyuri(request.user.username, 'Panel', rawSecret)

    // Setup token: encrypted secret + userId, 5 dakika geçerli
    const setupToken = jwt.sign(
      { userId: request.user.userId, encryptedSecret, step: 'totp_setup' },
      env.JWT_TEMP_SECRET,
      { expiresIn: '5m' },
    )

    return { totpUri, setupToken }
  })

  // POST /profile/2fa/enable — Kodu doğrula ve 2FA'yı etkinleştir
  app.post('/2fa/enable', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    schema: {
      tags: ['Profile'],
      summary: '2FA etkinleştir',
      body: z.object({
        code:       z.string().length(6).regex(/^\d{6}$/),
        setupToken: z.string(),
      }),
      response: { 200: z.object({ success: z.boolean() }) },
    },
  }, async (request) => {
    const { code, setupToken } = request.body

    let payload: jwt.JwtPayload
    try {
      const decoded = jwt.verify(setupToken, env.JWT_TEMP_SECRET)
      if (typeof decoded === 'string') throw new Error('Invalid')
      payload = decoded
    } catch {
      throw new AppError('INVALID_SETUP_TOKEN', 'Geçersiz veya süresi dolmuş kurulum tokeni.', 401)
    }

    if (payload['step'] !== 'totp_setup' || payload['userId'] !== request.user.userId) {
      throw new AppError('INVALID_SETUP_TOKEN', 'Geçersiz kurulum tokeni.', 401)
    }

    const encryptedSecret = payload['encryptedSecret'] as string
    authService.validateTotp(encryptedSecret, code)

    await db.update(users)
      .set({ totpSecret: encryptedSecret, updatedAt: new Date() })
      .where(eq(users.id, request.user.userId))

    return { success: true }
  })

  // DELETE /profile/2fa — 2FA devre dışı bırak
  app.delete('/2fa', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    schema: {
      tags: ['Profile'],
      summary: '2FA devre dışı bırak',
      response: { 200: z.object({ success: z.boolean() }) },
    },
  }, async (request) => {
    await db.update(users)
      .set({ totpSecret: null, updatedAt: new Date() })
      .where(eq(users.id, request.user.userId))

    return { success: true }
  })
}
