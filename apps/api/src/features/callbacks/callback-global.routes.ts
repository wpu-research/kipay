import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireTenantAdmin } from '../../middleware/roles.js'
import { callbackService } from './callback.service.js'
import { GlobalCallbackListResponseSchema, CallbackStatusSummarySchema } from '@panel/types'
import { AppError } from '../../errors/app-error.js'

export const callbackGlobalRoutes: FastifyPluginAsyncZod = async (fastify) => {

  // GET /status-summary — callback durumu özeti (tanı için)
  fastify.get('/status-summary', {
    preHandler: [authenticate, requireTenantAdmin],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags:     ['Callbacks'],
      summary:  'callbackStatus dağılımı',
      response: { 200: CallbackStatusSummarySchema },
    },
  }, async (request, reply) => {
    const { role, tenantId } = request.user
    const result = await callbackService.getCallbackStatusSummary(
      role === 'super_admin' ? null : tenantId,
    )
    return reply.send(result)
  })

  // GET / — tenant_admin (kendi tenant'ı), super_admin (tümü)
  fastify.get('/', {
    preHandler: [authenticate, requireTenantAdmin],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Callbacks'],
      summary: 'Tüm callback logları (paginated)',
      querystring: z.object({
        page:          z.coerce.number().int().min(1).max(1000).default(1),
        limit:         z.coerce.number().int().min(1).max(100).default(20),
        success:       z.enum(['true', 'false']).optional(),
        from:          z.string().datetime().optional(),
        to:            z.string().datetime().optional(),
        transactionId: z.string().uuid().optional(),
        merchantId:    z.string().uuid().optional(),
      }),
      response: { 200: GlobalCallbackListResponseSchema },
    },
  }, async (request, reply) => {
    const { role, tenantId } = request.user
    const { page, limit, success, from, to, transactionId, merchantId } = request.query

    // merchantId filtresi yalnızca super_admin kullanabilir
    if (merchantId && role !== 'super_admin') {
      throw new AppError('FORBIDDEN', 'merchantId filtresi yalnızca super_admin için geçerlidir', 403)
    }

    const result = await callbackService.listAllCallbackLogs({
      tenantId:      role === 'super_admin' ? null : tenantId,
      page,
      limit,
      success:       success === 'true' ? true : success === 'false' ? false : undefined,
      from,
      to,
      transactionId,
      merchantId,
    })

    return reply.send(result)
  })
}
