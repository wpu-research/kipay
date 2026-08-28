import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  CreateTenantSchema,
  UpdateTenantSchema,
  UpdateTenantStatusSchema,
  TenantResponseSchema,
  TenantListResponseSchema,
  AuditLogFilterSchema,
  AuditLogListResponseSchema,
} from '@panel/types'
import { tenantService } from './tenant.service.js'
import { auditLogService } from '../audit/audit.service.js'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'

// preHandler hook — body parsing/Zod validasyonundan ÖNCE çalışır
// P-1: request.user null guard — authenticate eksik bağlanırsa 500 yerine 401 döner
async function requireSuperAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) {
    throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  }
  if (request.user.role !== 'super_admin') {
    throw new AppError('FORBIDDEN', 'Bu işlem yalnızca super admin yetkisiyle yapılabilir.', 403)
  }
}

export const tenantRoutes: FastifyPluginAsyncZod = async (app) => {

  // GET /tenants — Sayfalı liste
  app.get('/', {
    preHandler: [authenticate, requireSuperAdmin],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Tenants'],
      summary: 'Tenant listesi',
      querystring: z.object({
        page:  z.coerce.number().min(1).max(1000).default(1),
        limit: z.coerce.number().min(1).max(100).default(20),
      }),
      response: { 200: TenantListResponseSchema },
    },
  }, async (request) => {
    const { page, limit } = request.query
    const { data, meta } = await tenantService.getTenants(page, limit)
    return {
      data: data.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })),
      meta,
    }
  })

  // GET /tenants/:id — Tekil tenant
  app.get('/:id', {
    preHandler: [authenticate, requireSuperAdmin],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Tenants'],
      summary: 'Tenant detayı',
      params: z.object({ id: z.string().uuid() }),
      response: { 200: TenantResponseSchema },
    },
  }, async (request) => {
    const tenant = await tenantService.getTenantById(request.params.id)
    return { data: { ...tenant, createdAt: tenant.createdAt.toISOString(), updatedAt: tenant.updatedAt.toISOString() } }
  })

  // POST /tenants — Yeni tenant oluştur
  app.post('/', {
    preHandler: [authenticate, requireSuperAdmin],
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Tenants'],
      summary: 'Tenant oluştur',
      body: CreateTenantSchema,
      response: { 201: TenantResponseSchema },
    },
  }, async (request, reply) => {
    const tenant = await tenantService.createTenant(request.body)
    request.log.info({
      event: 'tenant.created',
      actorId: request.user.userId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
    }, `Tenant oluşturuldu: ${tenant.name} (${tenant.slug})`)
    request.auditEntry = {
      action:       'tenant.created',
      resourceType: 'tenant',
      resourceId:   tenant.id,
      tenantId:     tenant.id,
      changes:      { name: tenant.name, slug: tenant.slug },
    }
    return reply.status(201).send({
      data: { ...tenant, createdAt: tenant.createdAt.toISOString(), updatedAt: tenant.updatedAt.toISOString() },
    })
  })

  // PUT /tenants/:id — Tenant güncelle
  app.put('/:id', {
    preHandler: [authenticate, requireSuperAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Tenants'],
      summary: 'Tenant güncelle',
      params: z.object({ id: z.string().uuid() }),
      body: UpdateTenantSchema,
      response: { 200: TenantResponseSchema },
    },
  }, async (request) => {
    const tenant = await tenantService.updateTenant(request.params.id, request.body)
    // P-3: Değişen alanları audit log'a ekle — undefined ise Fastify serializer atlar
    request.log.info({
      event: 'tenant.updated',
      actorId: request.user.userId,
      tenantId: tenant.id,
      newName: request.body.name,
      newSlug: request.body.slug,
    }, `Tenant güncellendi: ${tenant.name}`)
    request.auditEntry = {
      action:       'tenant.updated',
      resourceType: 'tenant',
      resourceId:   request.params.id,
      tenantId:     request.params.id,
      changes:      { name: request.body.name, slug: request.body.slug },
    }
    return { data: { ...tenant, createdAt: tenant.createdAt.toISOString(), updatedAt: tenant.updatedAt.toISOString() } }
  })

  // GET /tenants/:id/audit-logs — Tenant audit log listesi
  app.get('/:id/audit-logs', {
    preHandler: [authenticate, requireSuperAdmin],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Tenants'],
      summary: 'Tenant audit logları',
      params: z.object({ id: z.string().uuid() }),
      querystring: AuditLogFilterSchema,
      response: { 200: AuditLogListResponseSchema },
    },
  }, async (request) => {
    const { id } = request.params
    const { page, limit, from, to, action } = request.query

    const { data, meta } = await auditLogService.getTenantAuditLogs(
      id,
      { from, to, action },
      { page, limit },
    )

    return {
      data: data.map(log => ({
        id:           log.id,
        tenantId:     log.tenantId,
        userId:       log.userId,
        userRole:     log.userRole,
        action:       log.action,
        resourceType: log.resourceType,
        resourceId:   log.resourceId ?? null,
        ip:           log.ip,
        changes:      log.changes ?? null,
        timestamp:    log.createdAt.toISOString(),
      })),
      meta,
    }
  })

  // DELETE /tenants/:id — Tenant sil
  app.delete('/:id', {
    preHandler: [authenticate, requireSuperAdmin],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      tags: ['Tenants'],
      summary: 'Tenant sil',
      params: z.object({ id: z.string().uuid() }),
      response: { 200: TenantResponseSchema },
    },
  }, async (request) => {
    if (request.params.id === request.user.tenantId) {
      throw new AppError('FORBIDDEN', 'Kendi tenant\'ınızı silemezsiniz.', 403)
    }
    const tenant = await tenantService.deleteTenant(request.params.id)
    request.log.info({
      event: 'tenant.deleted',
      actorId: request.user.userId,
      tenantId: tenant.id,
    }, `Tenant silindi: ${tenant.name} (${tenant.slug})`)
    request.auditEntry = {
      action:       'tenant.deleted',
      resourceType: 'tenant',
      resourceId:   tenant.id,
      tenantId:     tenant.id,
      changes:      { name: tenant.name, slug: tenant.slug },
    }
    return { data: { ...tenant, createdAt: tenant.createdAt.toISOString(), updatedAt: tenant.updatedAt.toISOString() } }
  })

  // PATCH /tenants/:id/status — Tenant aktif/pasif yap
  app.patch('/:id/status', {
    preHandler: [authenticate, requireSuperAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Tenants'],
      summary: 'Tenant durumu güncelle',
      params: z.object({ id: z.string().uuid() }),
      body: UpdateTenantStatusSchema,
      response: { 200: TenantResponseSchema },
    },
  }, async (request) => {
    const { status } = request.body
    const tenant = await tenantService.updateTenantStatus(request.params.id, status)
    request.log.info({
      event: 'tenant.status_changed',
      actorId: request.user.userId,
      tenantId: tenant.id,
      newStatus: status,
    }, `Tenant durum değiştirildi: ${tenant.name} → ${status}`)
    request.auditEntry = {
      action:       'tenant.status_changed',
      resourceType: 'tenant',
      resourceId:   request.params.id,
      tenantId:     request.params.id,
      changes:      { status },
    }
    return { data: { ...tenant, createdAt: tenant.createdAt.toISOString(), updatedAt: tenant.updatedAt.toISOString() } }
  })
}
