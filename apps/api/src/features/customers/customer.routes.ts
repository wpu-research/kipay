import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { CustomerListQuerySchema, CustomerListResponseSchema } from './customer.schema.js'
import { customerService } from './customer.service.js'
import { authenticate } from '../../middleware/auth.js'
import { requireSuperAdmin } from '../../middleware/roles.js'

export const customerRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET / — müşteri listesi (isim/telefon/TC arama)
  app.get('/', {
    preHandler: [authenticate, requireSuperAdmin],
    config:     { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: {
      querystring: CustomerListQuerySchema,
      response:    { 200: CustomerListResponseSchema },
      tags:        ['Customers'], summary: 'Müşteri (son kullanıcı) listesi',
    },
  }, async (request, reply) => {
    const { role, tenantId, merchantId } = request.user
    const result = await customerService.list({
      role, callerTenantId: tenantId, callerMerchantId: merchantId, ...request.query,
    })
    return reply.send(result)
  })
}
