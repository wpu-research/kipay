import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { UpdateClaimTimeoutBodySchema, UpdateTotpRequiredBodySchema, SettingsResponseSchema } from './settings.schema.js'
import { settingsService } from './settings.service.js'
import { authenticate } from '../../middleware/auth.js'
import { requireSuperAdmin, requireTenantAdmin } from '../../middleware/roles.js'
import { AppError } from '../../errors/app-error.js'

export const settingsRoutes: FastifyPluginAsyncZod = async (app) => {

  // GET /api/v1/settings — konfigürasyonu oku (super_admin + firma)
  app.get('/', {
    preHandler: [authenticate, requireTenantAdmin],
    schema: {
      response: { 200: SettingsResponseSchema },
      tags:     ['Settings'],
      summary:  'Sistem konfigürasyonunu getir',
    },
  }, async (_request, reply) => {
    const settings = await settingsService.getSettings()
    return reply.send(settings)
  })

  // PUT /api/v1/settings/totp-required — 2FA zorunluluğunu aç/kapat (super_admin only)
  app.put('/totp-required', {
    preHandler: [authenticate, requireSuperAdmin],
    schema: {
      body:     UpdateTotpRequiredBodySchema,
      response: { 200: SettingsResponseSchema },
      tags:     ['Settings'],
      summary:  '2FA zorunluluğunu güncelle',
    },
  }, async (request, reply) => {
    const { totpRequired } = request.body
    const updated = await settingsService.updateTotpRequired(totpRequired, request.user.userId)

    // AC #1 — audit log (CR-1)
    request.auditEntry = {
      action:       'settings.totp_required_updated',
      resourceType: 'system_settings',
      tenantId:     request.user.tenantId,
      changes:      { totpRequired },
    }

    return reply.send(updated)
  })

  // PUT /api/v1/settings/claim-timeout — claim timeout güncelle (super_admin only)
  app.put('/claim-timeout', {
    preHandler: [authenticate, requireSuperAdmin],
    schema: {
      body:     UpdateClaimTimeoutBodySchema,
      response: { 200: SettingsResponseSchema },
      tags:     ['Settings'],
      summary:  'Claim timeout süresini güncelle',
    },
  }, async (request, reply) => {
    const { timeoutMinutes } = request.body

    // CR-2: Spec'e uygun INVALID_TIMEOUT hata kodu (Zod int() kontrolü geçtikten sonra range doğrula)
    if (timeoutMinutes < 5 || timeoutMinutes > 60) {
      throw new AppError('INVALID_TIMEOUT', 'Timeout 5-60 dakika arasında olmalıdır.', 400)
    }

    const updated = await settingsService.updateClaimTimeout(timeoutMinutes, request.user.userId)

    // AC #1 — audit log (CR-1)
    request.auditEntry = {
      action:       'settings.claim_timeout_updated',
      resourceType: 'system_settings',
      tenantId:     request.user.tenantId,
      changes:      { timeoutMinutes },
    }

    return reply.send(updated)
  })
}
