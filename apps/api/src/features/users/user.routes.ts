import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  CreateUserSchema,
  UpdateUserStatusSchema,
  CreateUserResponseSchema,
  UserListResponseSchema,
} from '@panel/types'
import { userService } from './user.service.js'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'

// Kullanıcı yönetimi yapabilen roller
const ALLOWED_ROLES = ['super_admin', 'tenant_admin'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

function requireUserManagerRole(role: string): asserts role is AllowedRole {
  if (!(ALLOWED_ROLES as readonly string[]).includes(role)) {
    throw new AppError('FORBIDDEN', 'Bu işlem için yetkiniz yok.', 403)
  }
}

export const userRoutes: FastifyPluginAsyncZod = async (app) => {

  // GET /users — Tenant kapsamında sayfalı kullanıcı listesi
  app.get('/', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    schema: {
      tags: ['Users'],
      summary: 'Kullanıcı listesi',
      querystring: z.object({
        page:     z.coerce.number().int().min(1).max(1000).default(1),
        limit:    z.coerce.number().int().min(1).max(100).default(20),
        tenantId: z.string().uuid().optional(),
      }),
      response: { 200: UserListResponseSchema },
    },
  }, async (request) => {
    requireUserManagerRole(request.user.role)
    const { page, limit } = request.query
    // super_admin: opsiyonel tenantId filtresi (yoksa tüm tenant'lar)
    // diğerleri: her zaman kendi tenant'ları
    const tenantId = request.user.role === 'super_admin'
      ? request.query.tenantId
      : request.user.tenantId
    const { data, meta } = await userService.getUsers(tenantId, page, limit)
    return {
      data: data.map(u => ({
        id:         u.id,
        username:   u.username,
        role:       u.role,
        tenantId:   u.tenantId,
        tenantName: u.tenantName ?? undefined,
        merchantId: u.merchantId ?? null,
        status:     u.status,
        createdAt:  u.createdAt.toISOString(),
        updatedAt:  u.updatedAt.toISOString(),
      })),
      meta,
    }
  })

  // POST /users — Yeni kullanıcı oluştur
  app.post('/', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Users'],
      summary: 'Kullanıcı oluştur',
      body: CreateUserSchema,
      response: { 201: CreateUserResponseSchema },
    },
  }, async (request, reply) => {
    requireUserManagerRole(request.user.role)
    const user = await userService.createUser(
      request.body,
      request.user.role,
      request.user.tenantId,
    )
    request.log.info({
      event:     'user.created',
      actorId:   request.user.userId,
      userId:    user.id,
      username:  user.username,
      role:      user.role,
      tenantId:  user.tenantId,
    }, `Kullanıcı oluşturuldu: ${user.username} (${user.role})`)
    request.auditEntry = {
      action:       'user.created',
      resourceType: 'user',
      resourceId:   user.id,
      tenantId:     user.tenantId,
      changes:      { username: user.username, role: user.role },
    }
    return reply.status(201).send({
      data: {
        user: {
          id:         user.id,
          username:   user.username,
          role:       user.role,
          tenantId:   user.tenantId,
          merchantId: user.merchantId ?? null,
          status:     user.status,
          createdAt:  user.createdAt.toISOString(),
          updatedAt:  user.updatedAt.toISOString(),
        },
      },
    })
  })

  // DELETE /users/:id — Kullanıcı sil (super_admin ve tenant_admin)
  app.delete('/:id', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Users'],
      summary: 'Kullanıcı sil',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: z.object({ success: z.boolean() }) },
    },
  }, async (request, reply) => {
    requireUserManagerRole(request.user.role)
    if (request.params.id === request.user.userId) {
      throw new AppError('FORBIDDEN', 'Kendinizi silemezsiniz.', 403)
    }
    const deleted = await userService.deleteUser(
      request.params.id,
      request.user.role,
      request.user.tenantId,
    )
    request.log.info({ event: 'user.deleted', actorId: request.user.userId, userId: deleted.id }, `Kullanıcı silindi: ${deleted.username}`)
    request.auditEntry = {
      action:       'user.deleted',
      resourceType: 'user',
      resourceId:   deleted.id,
      tenantId:     deleted.tenantId,
      changes:      { username: deleted.username, role: deleted.role },
    }
    return reply.send({ success: true })
  })

  // PATCH /users/:id/status — Kullanıcı aktif/pasif
  app.patch('/:id/status', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 50, timeWindow: '1 minute' } },
    schema: {
      tags: ['Users'],
      summary: 'Kullanıcı durumu güncelle',
      params: z.object({ id: z.string().uuid() }),
      body:   UpdateUserStatusSchema,
      response: { 200: z.object({ data: z.object({
        id:        z.string().uuid(),
        username:  z.string(),
        status:    z.enum(['active', 'inactive']),
        updatedAt: z.string(),
      }) }) },
    },
  }, async (request) => {
    requireUserManagerRole(request.user.role)
    const updated = await userService.updateUserStatus(
      request.params.id,
      request.body.status,
      request.user.role,
      request.user.tenantId,
    )
    request.log.info({
      event:     'user.status_changed',
      actorId:   request.user.userId,
      userId:    updated.id,
      newStatus: request.body.status,
    }, `Kullanıcı durum değiştirildi: ${updated.username} → ${request.body.status}`)
    request.auditEntry = {
      action:       'user.status_changed',
      resourceType: 'user',
      resourceId:   request.params.id,
      tenantId:     updated.tenantId,
      changes:      { status: request.body.status },
    }
    return {
      data: {
        id:        updated.id,
        username:  updated.username,
        status:    updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      },
    }
  })
}
