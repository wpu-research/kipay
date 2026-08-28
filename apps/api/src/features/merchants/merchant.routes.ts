import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  CreateMerchantSchema,
  UpdateMerchantStatusSchema,
  MerchantResponseSchema,
  MerchantListResponseSchema,
} from '@panel/types'
import { merchantService } from './merchant.service.js'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'

const ALLOWED_ROLES = ['super_admin', 'tenant_admin'] as const
const ALLOWED_READ_ROLES = ['super_admin', 'tenant_admin', 'finans_admin'] as const

async function requireTenantAdminOrSuperAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!(ALLOWED_ROLES as readonly string[]).includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu işlem için tenant_admin veya super_admin yetkisi gerekli.', 403)
  }
}

async function requireMerchantRead(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!(ALLOWED_READ_ROLES as readonly string[]).includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu işlem için tenant_admin, finans_admin veya super_admin yetkisi gerekli.', 403)
  }
}

function serializeMerchant(m: {
  id: string; tenantId: string; tenantName?: string | null; merchantName: string; webhookUrl: string;
  isSandbox: boolean; status: 'active' | 'inactive'; callbackSecret: string | null;
  createdAt: Date; updatedAt: Date
}) {
  const { tenantName, ...rest } = m
  return {
    ...rest,
    ...(tenantName != null ? { tenantName } : {}),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}

export const merchantRoutes: FastifyPluginAsyncZod = async (app) => {

  // GET /merchants — Sayfalı liste
  app.get('/', {
    preHandler: [authenticate, requireMerchantRead],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchants'],
      summary: 'Merchant listesi',
      querystring: z.object({
        page:     z.coerce.number().min(1).max(1000).default(1),
        limit:    z.coerce.number().min(1).max(100).default(20),
        tenantId: z.string().uuid().optional(),
      }),
      response: { 200: MerchantListResponseSchema },
    },
  }, async (request) => {
    const { page, limit, tenantId: tenantIdFilter } = request.query
    const tenantId = request.user.role === 'super_admin' ? tenantIdFilter : request.user.tenantId
    const { data, meta } = await merchantService.getMerchants(tenantId, page, limit)
    const hideSecret = request.user.role === 'finans_admin'
    return { data: data.map((m) => serializeMerchant({ ...m, callbackSecret: hideSecret ? null : m.callbackSecret })), meta }
  })

  // GET /merchants/:id — Tekil merchant
  app.get('/:id', {
    preHandler: [authenticate, requireMerchantRead],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchants'],
      summary: 'Merchant detayı',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: MerchantResponseSchema },
    },
  }, async (request) => {
    const merchant = request.user.role === 'super_admin'
      ? await merchantService.getMerchantByIdUnscoped(request.params.id)
      : await merchantService.getMerchantById(request.user.tenantId, request.params.id)
    const hideSecret = request.user.role === 'finans_admin'
    return { data: serializeMerchant({ ...merchant, callbackSecret: hideSecret ? null : merchant.callbackSecret }) }
  })

  // POST /merchants — Yeni merchant oluştur
  app.post('/', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Merchants'],
      summary: 'Merchant oluştur',
      body:     CreateMerchantSchema,
      response: { 201: MerchantResponseSchema },
    },
  }, async (request, reply) => {
    const { tenantId: bodyTenantId, ...rest } = request.body
    const isSuperAdmin = request.user.role === 'super_admin'
    if (isSuperAdmin && !bodyTenantId) {
      throw new AppError('VALIDATION_ERROR', 'super_admin için tenantId zorunludur.', 400)
    }
    const tenantId = isSuperAdmin ? bodyTenantId! : request.user.tenantId
    const merchant = await merchantService.createMerchant(tenantId, rest)
    request.log.info({ event: 'merchant.created', actorId: request.user.userId, merchantId: merchant.id }, `Merchant oluşturuldu: ${merchant.merchantName}`)
    request.auditEntry = {
      action:       'merchant.created',
      resourceType: 'merchant',
      resourceId:   merchant.id,
      tenantId:     merchant.tenantId,
      changes:      { merchantName: merchant.merchantName, isSandbox: merchant.isSandbox },
    }
    return reply.status(201).send({ data: serializeMerchant(merchant) })
  })

  // DELETE /merchants/:id — Merchant sil
  app.delete('/:id', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchants'],
      summary: 'Merchant sil',
      params: z.object({ id: z.string().uuid() }),
      response: { 200: z.object({ data: z.object({ id: z.string() }) }) },
    },
  }, async (request) => {
    const tenantId = request.user.role === 'super_admin'
      ? (await merchantService.getMerchantByIdUnscoped(request.params.id)).tenantId
      : request.user.tenantId
    await merchantService.deleteMerchant(tenantId, request.params.id)
    request.log.info({ event: 'merchant.deleted', actorId: request.user.userId, merchantId: request.params.id }, 'Merchant silindi')
    request.auditEntry = {
      action:       'merchant.deleted',
      resourceType: 'merchant',
      resourceId:   request.params.id,
      tenantId,
      changes:      {},
    }
    return { data: { id: request.params.id } }
  })

  // PATCH /merchants/:id/sandbox — Sandbox/Production geçişi
  app.patch('/:id/sandbox', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchants'],
      summary: 'Sandbox/Production geçişi',
      params: z.object({ id: z.string().uuid() }),
      body:   z.object({ isSandbox: z.boolean() }),
      response: { 200: MerchantResponseSchema },
    },
  }, async (request) => {
    const tenantId = request.user.role === 'super_admin'
      ? (await merchantService.getMerchantByIdUnscoped(request.params.id)).tenantId
      : request.user.tenantId
    const merchant = await merchantService.toggleSandbox(tenantId, request.params.id, request.body.isSandbox)
    return { data: serializeMerchant(merchant) }
  })

  // POST /merchants/:id/regenerate-callback-secret — Callback secret'ı yenile
  app.post('/:id/regenerate-callback-secret', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Merchants'],
      summary: 'Callback secret yenile',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: MerchantResponseSchema },
    },
  }, async (request) => {
    const tenantId = request.user.role === 'super_admin'
      ? (await merchantService.getMerchantByIdUnscoped(request.params.id)).tenantId
      : request.user.tenantId
    const merchant = await merchantService.regenerateCallbackSecret(tenantId, request.params.id)
    return { data: serializeMerchant(merchant) }
  })

  // PATCH /merchants/:id/status — Durum değiştir
  app.patch('/:id/status', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchants'],
      summary: 'Merchant durumu güncelle',
      params:   z.object({ id: z.string().uuid() }),
      body:     UpdateMerchantStatusSchema,
      response: { 200: MerchantResponseSchema },
    },
  }, async (request) => {
    const tenantId = request.user.role === 'super_admin'
      ? (await merchantService.getMerchantByIdUnscoped(request.params.id)).tenantId
      : request.user.tenantId
    const merchant = await merchantService.updateMerchantStatus(tenantId, request.params.id, request.body.status)
    request.log.info({ event: 'merchant.status_changed', actorId: request.user.userId, merchantId: merchant.id, newStatus: request.body.status }, `Merchant durum değiştirildi: ${merchant.merchantName} → ${request.body.status}`)
    request.auditEntry = {
      action:       'merchant.status_changed',
      resourceType: 'merchant',
      resourceId:   merchant.id,
      tenantId:     merchant.tenantId,
      changes:      { status: request.body.status },
    }
    return { data: serializeMerchant(merchant) }
  })
}
