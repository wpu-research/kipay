import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  CreateApiKeySchema,
  ApiKeyListResponseSchema,
  ApiKeyCreatedResponseSchema,
  AddIpSchema,
  IpWhitelistResponseSchema,
} from '@panel/types'
import { merchantApiKeyService } from './merchant-api-key.service.js'
import { merchantService } from './merchant.service.js'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'

// super_admin herhangi bir merchant'a erişebilir; diğerleri kendi tenant'ıyla kısıtlı
async function resolveTenantId(role: string, userTenantId: string, merchantId: string): Promise<string> {
  if (role !== 'super_admin') return userTenantId
  const merchant = await merchantService.getMerchantByIdUnscoped(merchantId)
  return merchant.tenantId
}

const TENANT_ADMIN_ROLES = ['super_admin', 'tenant_admin'] as const

async function requireTenantAdminOrSuperAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!(TENANT_ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu işlem için tenant_admin veya super_admin yetkisi gerekli.', 403)
  }
}

export const merchantApiKeyRoutes: FastifyPluginAsyncZod = async (app) => {

  // GET /merchants/:id/api-keys
  app.get('/:id/api-keys', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    schema: {
      tags: ['Merchants'],
      summary: 'Merchant API key listesi',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: ApiKeyListResponseSchema },
    },
  }, async (request) => {
    const tenantId = await resolveTenantId(request.user.role, request.user.tenantId, request.params.id)
    const keys = await merchantApiKeyService.getApiKeys(tenantId, request.params.id)
    return { data: keys }
  })

  // POST /merchants/:id/api-keys
  app.post('/:id/api-keys', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Merchants'],
      summary: 'API key oluştur',
      params:   z.object({ id: z.string().uuid() }),
      body:     CreateApiKeySchema,
      response: { 201: ApiKeyCreatedResponseSchema },
    },
  }, async (request, reply) => {
    const tenantId = await resolveTenantId(request.user.role, request.user.tenantId, request.params.id)
    const apiKey = await merchantApiKeyService.createApiKey(tenantId, request.params.id, request.body)
    request.auditEntry = {
      action:       'merchant_api_key.created',
      resourceType: 'merchant_api_key',
      resourceId:   apiKey.id,
      tenantId,
      changes:      { merchantId: request.params.id, keyId: apiKey.keyId },
    }
    return reply.status(201).send({ data: apiKey })
  })

  // DELETE /merchants/:id/api-keys/:keyId
  app.delete('/:id/api-keys/:keyId', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    schema: {
      tags: ['Merchants'],
      summary: 'API key iptal et',
      params: z.object({ id: z.string().uuid(), keyId: z.string() }),
    },
  }, async (request, reply) => {
    const tenantId = await resolveTenantId(request.user.role, request.user.tenantId, request.params.id)
    await merchantApiKeyService.revokeApiKey(tenantId, request.params.id, request.params.keyId)
    request.auditEntry = {
      action:       'merchant_api_key.revoked',
      resourceType: 'merchant_api_key',
      resourceId:   request.params.keyId,
      tenantId,
      changes:      { merchantId: request.params.id, keyId: request.params.keyId },
    }
    return reply.status(204).send()
  })

  // POST /merchants/:id/api-keys/:keyId/rotate
  app.post('/:id/api-keys/:keyId/rotate', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Merchants'],
      summary: 'API key rotate et',
      params:   z.object({ id: z.string().uuid(), keyId: z.string() }),
      response: { 200: ApiKeyCreatedResponseSchema },
    },
  }, async (request) => {
    const tenantId = await resolveTenantId(request.user.role, request.user.tenantId, request.params.id)
    const apiKey = await merchantApiKeyService.rotateApiKey(tenantId, request.params.id, request.params.keyId)
    request.auditEntry = {
      action:       'merchant_api_key.rotated',
      resourceType: 'merchant_api_key',
      resourceId:   apiKey.id,
      tenantId,
      changes:      { merchantId: request.params.id, keyId: apiKey.keyId },
    }
    return { data: apiKey }
  })

  // GET /merchants/:id/ip-whitelist
  app.get('/:id/ip-whitelist', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    schema: {
      tags: ['Merchants'],
      summary: 'IP whitelist listesi',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: IpWhitelistResponseSchema },
    },
  }, async (request) => {
    const tenantId = await resolveTenantId(request.user.role, request.user.tenantId, request.params.id)
    const entries = await merchantApiKeyService.getIpWhitelist(tenantId, request.params.id)
    return { data: entries }
  })

  // POST /merchants/:id/ip-whitelist
  app.post('/:id/ip-whitelist', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    schema: {
      tags: ['Merchants'],
      summary: 'IP whitelist\'e ekle',
      params: z.object({ id: z.string().uuid() }),
      body:   AddIpSchema,
    },
  }, async (request, reply) => {
    const tenantId = await resolveTenantId(request.user.role, request.user.tenantId, request.params.id)
    const entry = await merchantApiKeyService.addIp(tenantId, request.params.id, request.body.ipAddress)
    return reply.status(201).send({ data: entry })
  })

  // DELETE /merchants/:id/ip-whitelist/:ip
  app.delete('/:id/ip-whitelist/:ip', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    schema: {
      tags: ['Merchants'],
      summary: 'IP whitelist\'ten kaldır',
      params: z.object({ id: z.string().uuid(), ip: z.string() }),
    },
  }, async (request, reply) => {
    const tenantId = await resolveTenantId(request.user.role, request.user.tenantId, request.params.id)
    await merchantApiKeyService.removeIp(tenantId, request.params.id, request.params.ip)
    return reply.status(204).send()
  })
}
