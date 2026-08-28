import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  CreatePaymentProviderSchema,
  UpdatePaymentProviderSchema,
  PaymentProviderResponseSchema,
  PaymentProviderListResponseSchema,
  CreatePaymentProviderCategorySchema,
  UpdatePaymentProviderCategorySchema,
  PaymentProviderCategoryResponseSchema,
  PaymentProviderCategoryListResponseSchema,
} from '@panel/types'
import { paymentProviderService } from './payment-provider.service.js'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'

const ALLOWED_ROLES = ['super_admin', 'tenant_admin'] as const

async function requireTenantAdminOrSuperAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!(ALLOWED_ROLES as readonly string[]).includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu işlem için tenant_admin veya super_admin yetkisi gerekli.', 403)
  }
}

function serializeProvider(p: { id: string; tenantId: string; name: string; status: 'active' | 'inactive'; createdAt: Date; updatedAt: Date }) {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }
}

function serializeCategory(c: { id: string; tenantId: string; name: string; createdAt: Date; updatedAt: Date }) {
  return { ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() }
}

export const paymentProviderRoutes: FastifyPluginAsyncZod = async (app) => {

  // --- PAYMENT PROVIDERS ---

  // GET /payment-providers
  app.get('/', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Payment Providers'],
      summary: 'Ödeme sağlayıcı listesi',
      querystring: z.object({
        page:  z.coerce.number().int().min(1).max(1000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
      response: { 200: PaymentProviderListResponseSchema },
    },
  }, async (request) => {
    const { page, limit } = request.query
    const { data, meta } = await paymentProviderService.getProviders(request.user.tenantId, page, limit)
    return { data: data.map(serializeProvider), meta }
  })

  // POST /payment-providers
  app.post('/', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Payment Providers'],
      summary: 'Ödeme sağlayıcı oluştur',
      body:     CreatePaymentProviderSchema,
      response: { 201: PaymentProviderResponseSchema },
    },
  }, async (request, reply) => {
    const provider = await paymentProviderService.createProvider(request.user.tenantId, request.body)
    request.auditEntry = {
      action:       'payment_provider.created',
      resourceType: 'payment_provider',
      resourceId:   provider.id,
      tenantId:     request.user.tenantId,
      changes:      { name: provider.name },
    }
    return reply.status(201).send({ data: serializeProvider(provider) })
  })

  // --- PAYMENT PROVIDER CATEGORIES ---
  // Literal path'ler (:id) param path'inden ÖNCE tanımlanmalı

  // GET /payment-providers/categories
  app.get('/categories', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Payment Providers'],
      summary: 'Kategori listesi',
      querystring: z.object({
        page:  z.coerce.number().int().min(1).max(1000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
      response: { 200: PaymentProviderCategoryListResponseSchema },
    },
  }, async (request) => {
    const { page, limit } = request.query
    const { data, meta } = await paymentProviderService.getCategories(request.user.tenantId, page, limit)
    return { data: data.map(serializeCategory), meta }
  })

  // POST /payment-providers/categories
  app.post('/categories', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Payment Providers'],
      summary: 'Kategori oluştur',
      body:     CreatePaymentProviderCategorySchema,
      response: { 201: PaymentProviderCategoryResponseSchema },
    },
  }, async (request, reply) => {
    const category = await paymentProviderService.createCategory(request.user.tenantId, request.body)
    request.auditEntry = {
      action:       'payment_provider_category.created',
      resourceType: 'payment_provider_category',
      resourceId:   category.id,
      tenantId:     request.user.tenantId,
      changes:      { name: category.name },
    }
    return reply.status(201).send({ data: serializeCategory(category) })
  })

  // PUT /payment-providers/categories/:id
  app.put('/categories/:id', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Payment Providers'],
      summary: 'Kategori güncelle',
      params:   z.object({ id: z.string().uuid() }),
      body:     UpdatePaymentProviderCategorySchema,
      response: { 200: PaymentProviderCategoryResponseSchema },
    },
  }, async (request) => {
    const category = await paymentProviderService.updateCategory(
      request.user.tenantId,
      request.params.id,
      request.body,
    )
    request.auditEntry = {
      action:       'payment_provider_category.updated',
      resourceType: 'payment_provider_category',
      resourceId:   category.id,
      tenantId:     request.user.tenantId,
      changes:      request.body,
    }
    return { data: serializeCategory(category) }
  })

  // PUT /payment-providers/:id
  app.put('/:id', {
    preHandler: [authenticate, requireTenantAdminOrSuperAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Payment Providers'],
      summary: 'Ödeme sağlayıcı güncelle',
      params:   z.object({ id: z.string().uuid() }),
      body:     UpdatePaymentProviderSchema,
      response: { 200: PaymentProviderResponseSchema },
    },
  }, async (request) => {
    const provider = await paymentProviderService.updateProvider(
      request.user.tenantId,
      request.params.id,
      request.body,
    )
    request.auditEntry = {
      action:       'payment_provider.updated',
      resourceType: 'payment_provider',
      resourceId:   provider.id,
      tenantId:     request.user.tenantId,
      changes:      request.body,
    }
    return { data: serializeProvider(provider) }
  })
}
