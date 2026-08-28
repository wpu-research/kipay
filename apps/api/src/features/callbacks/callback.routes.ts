import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireTenantAdmin } from '../../middleware/roles.js'
import { callbackService } from './callback.service.js'
import { RetryCallbackResponseSchema, CallbackListResponseSchema } from '@panel/types'

export const callbackRoutes: FastifyPluginAsyncZod = async (fastify) => {

  // POST /:id/retry-callback — firma / super_admin
  fastify.post('/:id/retry-callback', {
    preHandler: [authenticate, requireTenantAdmin],
    config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'Callback yeniden dene',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: RetryCallbackResponseSchema },
    },
  }, async (request, reply) => {
    const result = await callbackService.retryCallback(
      request.server.boss,
      request.user.tenantId,
      request.params.id,
    )
    return reply.send(result)
  })

  // GET /:id/callbacks — authenticate
  fastify.get('/:id/callbacks', {
    preHandler: [authenticate],
    config:     { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'Callback log listesi',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: CallbackListResponseSchema },
    },
  }, async (request, reply) => {
    const logs = await callbackService.listCallbackLogs(
      request.user.tenantId,
      request.params.id,
    )
    return reply.send({ data: logs })
  })
}
