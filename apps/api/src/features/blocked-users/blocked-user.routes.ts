import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BlockUserSchema } from '@panel/types'
import { blockedUserService } from './blocked-user.service.js'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'

const BLOCK_ALLOWED_ROLES = ['super_admin', 'tenant_admin'] as const

function requireBlockRole(role: string) {
  if (!(BLOCK_ALLOWED_ROLES as readonly string[]).includes(role)) {
    throw new AppError('FORBIDDEN', 'Bu işlem için yetkiniz yok.', 403)
  }
}

export const blockedUserRoutes: FastifyPluginAsyncZod = async (app) => {

  // POST /api/v1/users/:id/block
  app.post('/:id/block', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Users'],
      summary: 'Kullanıcıyı engelle',
      params: z.object({ id: z.string().uuid() }),
      body: BlockUserSchema,
      response: {
        200: z.object({
          data: z.object({
            blockedUntil:         z.string().nullable(),
            isPermanentlyBlocked: z.boolean(),
          }),
        }),
      },
    },
  }, async (request) => {
    requireBlockRole(request.user.role)

    const blockData = {
      blockedUntil: 'blockedUntil' in request.body && request.body.blockedUntil
        ? new Date(request.body.blockedUntil)
        : undefined,
      permanent: 'permanent' in request.body ? (request.body.permanent as boolean | undefined) : undefined,
    }

    const result = await blockedUserService.blockUser(
      request.params.id,
      blockData,
      request.user.role,
      request.user.tenantId,
      request.user.userId,
    )

    // [CR-2 Fix Medium] Masquerade modunda gerçek işlemi yapan super_admin loglanır
    request.log.info({
      event:                'user.blocked',
      actorId:              request.user.originalUserId ?? request.user.userId,
      masqueradingAs:       request.user.originalUserId ? request.user.userId : undefined,
      targetUserId:         request.params.id,
      isPermanentlyBlocked: result.isPermanentlyBlocked,
      blockedUntil:         result.blockedUntil,
    }, `Kullanıcı engellendi: ${request.params.id}`)
    request.auditEntry = {
      action:       'user.blocked',
      resourceType: 'user',
      resourceId:   request.params.id,
      tenantId:     result.tenantId,   // hedef kullanıcının tenant'ı (cross-tenant senaryosunda doğru tenant)
      changes:      { isPermanentlyBlocked: result.isPermanentlyBlocked, blockedUntil: result.blockedUntil },
    }

    return { data: result }
  })

  // POST /api/v1/users/:id/unblock
  app.post('/:id/unblock', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Users'],
      summary: 'Kullanıcı engelini kaldır',
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: z.object({
          data: z.object({
            id:       z.string().uuid(),
            username: z.string(),
          }),
        }),
      },
    },
  }, async (request) => {
    requireBlockRole(request.user.role)

    const updated = await blockedUserService.unblockUser(
      request.params.id,
      request.user.role,
      request.user.tenantId,
    )

    // [CR-2 Fix Medium] Masquerade modunda gerçek işlemi yapan super_admin loglanır
    request.log.info({
      event:          'user.unblocked',
      actorId:        request.user.originalUserId ?? request.user.userId,
      masqueradingAs: request.user.originalUserId ? request.user.userId : undefined,
      targetUserId:   request.params.id,
    }, `Kullanıcı engeli kaldırıldı: ${request.params.id}`)
    request.auditEntry = {
      action:       'user.unblocked',
      resourceType: 'user',
      resourceId:   request.params.id,
      tenantId:     updated.tenantId,   // hedef kullanıcının tenant'ı (cross-tenant senaryosunda doğru tenant)
      changes:      {},
    }

    return { data: updated }
  })
}
