import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { BlockPlayerSchema, BlockedPlayerListResponseSchema } from '@panel/types'
import { blockedPlayerService } from './blocked-player.service.js'
import { authenticate } from '../../middleware/auth.js'
import { requireTenantAdmin } from '../../middleware/roles.js'

export const blockedPlayerRoutes: FastifyPluginAsyncZod = async (app) => {

  // POST /api/v1/blocked-players
  app.post('/', {
    preHandler: [authenticate, requireTenantAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Blocked Players'],
      summary: 'Oyuncu engelle',
      body:     BlockPlayerSchema,
      response: { 201: z.object({ data: z.any() }) },
    },
  }, async (request, reply) => {
    const result = await blockedPlayerService.blockPlayer(
      request.user.tenantId,
      request.user.userId,
      request.body,
    )
    request.auditEntry = {
      action: 'player.blocked', resourceType: 'blocked_player', resourceId: result.id,
      tenantId: request.user.tenantId, changes: { externalUserId: result.externalUserId, merchantId: result.merchantId },
    }
    return reply.status(201).send({ data: result })
  })

  // GET /api/v1/blocked-players
  app.get('/', {
    preHandler: [authenticate, requireTenantAdmin],
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: {
      tags: ['Blocked Players'],
      summary: 'Engelli oyuncu listesi',
      querystring: z.object({
        merchantId: z.string().uuid().optional(),
        status:     z.enum(['active', 'expired', 'all']).default('all'),
        page:       z.coerce.number().min(1).default(1),
        limit:      z.coerce.number().min(1).max(100).default(20),
      }),
      response: { 200: BlockedPlayerListResponseSchema },
    },
  }, async (request, reply) => {
    const result = await blockedPlayerService.listBlockedPlayers(
      request.user.tenantId,
      { ...request.query },
    )
    return reply.send(result)
  })

  // DELETE /api/v1/blocked-players/:id
  app.delete('/:id', {
    preHandler: [authenticate, requireTenantAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Blocked Players'],
      summary: 'Oyuncu engelini kaldır',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: z.object({ data: z.object({ id: z.string().uuid() }) }) },
    },
  }, async (request, reply) => {
    const deleted = await blockedPlayerService.unblockPlayer(
      request.user.tenantId,
      request.params.id,
    )
    request.auditEntry = {
      action: 'player.unblocked', resourceType: 'blocked_player', resourceId: deleted.id,
      tenantId: request.user.tenantId, changes: {},
    }
    return reply.send({ data: { id: deleted.id } })
  })
}
