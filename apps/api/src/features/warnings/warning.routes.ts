import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { CreateWarningRuleSchema, UpdateWarningRuleStatusSchema,
         PaginatedWarningRulesSchema, PaginatedWarningsSchema } from '@panel/types'
import { warningService } from './warning.service.js'
import { authenticate } from '../../middleware/auth.js'
import { requireTenantAdmin } from '../../middleware/roles.js'

export const warningRoutes: FastifyPluginAsyncZod = async (app) => {

  // POST /api/v1/warnings/rules
  app.post('/rules', {
    preHandler: [authenticate, requireTenantAdmin],
    schema: {
      tags: ['Warnings'],
      summary: 'Uyarı kuralı oluştur',
      body:     CreateWarningRuleSchema,
      response: { 201: z.object({ data: z.any() }) },
    },
  }, async (request, reply) => {
    const rule = await warningService.createRule(
      request.user.tenantId,
      request.user.userId,
      request.body,
    )
    request.auditEntry = {
      action: 'warning_rule.created', resourceType: 'warning_rule', resourceId: rule.id,
      tenantId: request.user.tenantId, changes: { ruleType: rule.ruleType, threshold: rule.threshold },
    }
    return reply.status(201).send({ data: rule })
  })

  // GET /api/v1/warnings/rules
  app.get('/rules', {
    preHandler: [authenticate, requireTenantAdmin],
    schema: {
      tags: ['Warnings'],
      summary: 'Uyarı kuralı listesi',
      querystring: z.object({
        page:  z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(20),
      }),
      response: { 200: PaginatedWarningRulesSchema },
    },
  }, async (request, reply) => {
    const result = await warningService.listRules(request.user.tenantId, request.query)
    return reply.send(result as any)
  })

  // PATCH /api/v1/warnings/rules/:id/status
  app.patch('/rules/:id/status', {
    preHandler: [authenticate, requireTenantAdmin],
    schema: {
      tags: ['Warnings'],
      summary: 'Uyarı kuralı durumu güncelle',
      params:   z.object({ id: z.string().uuid() }),
      body:     UpdateWarningRuleStatusSchema,
      response: { 200: z.object({ data: z.any() }) },
    },
  }, async (request, reply) => {
    const updated = await warningService.updateStatus(
      request.user.tenantId,
      request.params.id,
      request.body.isActive,
    )
    return reply.send({ data: updated })
  })

  // GET /api/v1/warnings
  app.get('/', {
    preHandler: [authenticate, requireTenantAdmin],
    schema: {
      tags: ['Warnings'],
      summary: 'Uyarı listesi',
      querystring: z.object({
        status:   z.enum(['open', 'acknowledged', 'all']).default('all'),
        ruleType: z.enum(['transaction_frequency', 'amount_threshold', 'repeat_rejection']).optional(),
        page:     z.coerce.number().min(1).default(1),
        limit:    z.coerce.number().min(1).max(100).default(20),
      }),
      response: { 200: PaginatedWarningsSchema },
    },
  }, async (request, reply) => {
    const result = await warningService.listWarnings(request.user.tenantId, request.query)
    return reply.send(result as any)
  })

  // POST /api/v1/warnings/:id/acknowledge
  app.post('/:id/acknowledge', {
    preHandler: [authenticate, requireTenantAdmin],
    schema: {
      tags: ['Warnings'],
      summary: 'Uyarıyı kabul et',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: z.object({ data: z.any() }) },
    },
  }, async (request, reply) => {
    const updated = await warningService.acknowledgeWarning(
      request.user.tenantId,
      request.params.id,
      request.user.userId,
    )
    request.auditEntry = {
      action: 'warning.acknowledged', resourceType: 'warning', resourceId: updated.id,
      tenantId: request.user.tenantId, changes: {},
    }
    return reply.send({ data: updated })
  })
}
