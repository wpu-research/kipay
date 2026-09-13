import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  CommissionReportQuerySchema, CommissionReportResponseSchema,
  CommissionRatesQuerySchema, CommissionRatesResponseSchema, CommissionRateUpsertSchema,
  SettlementsQuerySchema, SettlementsResponseSchema, SettlementUpsertSchema,
} from './commission.schema.js'
import { commissionService } from './commission.service.js'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'

const REPORT_ROLES = ['super_admin', 'tenant_admin', 'finans_admin']
const WRITE_ROLES  = ['super_admin', 'tenant_admin']

export const commissionRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /report — günlük × yöntem komisyon raporu
  app.get('/report', {
    preHandler: [authenticate],
    schema: {
      querystring: CommissionReportQuerySchema,
      response:    { 200: CommissionReportResponseSchema },
      tags:        ['Commission'], summary: 'Gelir/gider (komisyon) raporu',
    },
  }, async (request, reply) => {
    const { role, tenantId } = request.user
    if (!REPORT_ROLES.includes(role)) throw new AppError('FORBIDDEN', 'Bu rapora erişim yetkiniz yok.', 403)
    const result = await commissionService.getReport({ role, callerTenantId: tenantId, ...request.query })
    return reply.send(result)
  })

  // GET /rates — komisyon oranları
  app.get('/rates', {
    preHandler: [authenticate],
    schema: {
      querystring: CommissionRatesQuerySchema,
      response:    { 200: CommissionRatesResponseSchema },
      tags:        ['Commission'], summary: 'Komisyon oranları',
    },
  }, async (request, reply) => {
    const { role, tenantId } = request.user
    if (!REPORT_ROLES.includes(role)) throw new AppError('FORBIDDEN', 'Yetkiniz yok.', 403)
    const data = await commissionService.listRates({ role, callerTenantId: tenantId, ...request.query })
    return reply.send({ data })
  })

  // PUT /rates — oran ekle/güncelle
  app.put('/rates', {
    preHandler: [authenticate],
    schema: {
      body:     CommissionRateUpsertSchema,
      response: { 200: CommissionRatesResponseSchema.shape.data.element },
      tags:     ['Commission'], summary: 'Komisyon oranı kaydet',
    },
  }, async (request, reply) => {
    const { role, tenantId } = request.user
    if (!WRITE_ROLES.includes(role)) throw new AppError('FORBIDDEN', 'Oran değiştirme yetkiniz yok.', 403)
    const row = await commissionService.upsertRate({ role, callerTenantId: tenantId, ...request.body })
    return reply.send(row)
  })

  // GET /settlements — mutabakat kayıtları
  app.get('/settlements', {
    preHandler: [authenticate],
    schema: {
      querystring: SettlementsQuerySchema,
      response:    { 200: SettlementsResponseSchema },
      tags:        ['Commission'], summary: 'Günlük mutabakat listesi',
    },
  }, async (request, reply) => {
    const { role, tenantId } = request.user
    if (!REPORT_ROLES.includes(role)) throw new AppError('FORBIDDEN', 'Yetkiniz yok.', 403)
    const data = await commissionService.listSettlements({ role, callerTenantId: tenantId, ...request.query })
    return reply.send({ data })
  })

  // PUT /settlements — mutabakat ekle/güncelle
  app.put('/settlements', {
    preHandler: [authenticate],
    schema: {
      body:     SettlementUpsertSchema,
      response: { 200: SettlementsResponseSchema.shape.data.element },
      tags:     ['Commission'], summary: 'Günlük mutabakat kaydet',
    },
  }, async (request, reply) => {
    const { role, tenantId, userId } = request.user
    if (!WRITE_ROLES.includes(role)) throw new AppError('FORBIDDEN', 'Mutabakat girme yetkiniz yok.', 403)
    const row = await commissionService.upsertSettlement({ role, callerTenantId: tenantId, userId, ...request.body })
    return reply.send(row)
  })
}
