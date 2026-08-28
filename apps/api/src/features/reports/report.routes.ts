import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import * as fs from 'node:fs'
import {
  TransactionReportQuerySchema,
  CallbackReportQuerySchema,
  TransactionReportResponseSchema,
  CallbackReportResponseSchema,
  ExportRequestBodySchema,
  ExportJobStatusSchema,
  MerchantDailyReportQuerySchema,
  MerchantDailyReportResponseSchema,
} from './report.schema.js'
import { reportService } from './report.service.js'
import { authenticate } from '../../middleware/auth.js'
import { requireSuperAdmin } from '../../middleware/roles.js'
import { AppError } from '../../errors/app-error.js'
import { db, exportJobs, eq } from '@panel/db'

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {

  // GET /api/v1/reports/transactions — işlem hacmi raporu
  app.get('/transactions', {
    preHandler: [authenticate],
    schema: {
      querystring: TransactionReportQuerySchema,
      response:    { 200: TransactionReportResponseSchema },
      tags:        ['Reports'],
      summary:     'İşlem hacmi raporu',
    },
  }, async (request, reply) => {
    const { role, tenantId: callerTenantId } = request.user
    // merchantId claim henüz JWT'de bulunmuyor — merchant rolü için 403
    const callerMerchantId = (request.user as Record<string, unknown>).merchantId as string | undefined

    // Yalnızca yetkili roller rapor alabilir — finans/operator/diğer roller cross-tenant veri sızdırabilir
    if (!['merchant', 'tenant_admin', 'finans_admin', 'finans_operator', 'super_admin'].includes(role)) {
      throw new AppError('FORBIDDEN', 'Bu rapora erişim yetkiniz yok.', 403)
    }

    if (role === 'merchant' && !callerMerchantId) {
      throw new AppError('FORBIDDEN', 'Merchant kullanıcısının merchantId claim\'i eksik.', 403)
    }

    const result = await reportService.getTransactionReport({
      role,
      callerTenantId,
      callerMerchantId,
      ...request.query,
    })

    return reply.send({ data: result })
  })


  // POST /api/v1/reports/export — async export başlat (firma veya super_admin)
  app.post('/export', {
    preHandler: [authenticate],
    schema: {
      body:     ExportRequestBodySchema,
      response: { 202: z.object({ jobId: z.string().uuid() }) },
      tags:     ['Reports'],
      summary:  'İşlem export\'u başlat',
    },
  }, async (request, reply) => {
    const { role, userId, tenantId: callerTenantId } = request.user

    if (!['tenant_admin', 'super_admin'].includes(role)) {
      throw new AppError('FORBIDDEN', 'Export yetkisi yok.', 403)
    }

    const { format, tenantId: bodyTenantId, ...restFilters } = request.body
    const filters = restFilters as Record<string, unknown>
    if (bodyTenantId && role === 'super_admin') filters.tenantId = bodyTenantId

    const [job] = await db.insert(exportJobs).values({
      format,
      filters,
      requestedByUserId: userId,
      tenantId:          role === 'tenant_admin' ? callerTenantId : (bodyTenantId ?? null),
      role,
      status:            'pending',
    }).returning()

    await request.server.boss.send('report-export', { jobId: job.id }, { retryLimit: 2 })

    return reply.status(202).send({ jobId: job.id })
  })

  // GET /api/v1/reports/export/:jobId — job durumu
  app.get('/export/:jobId', {
    preHandler: [authenticate],
    schema: {
      response: { 200: ExportJobStatusSchema },
      tags:     ['Reports'],
      summary:  'Export job durumu',
    },
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    const { userId, role } = request.user

    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId))
    if (!job) throw new AppError('NOT_FOUND', 'Export job bulunamadı.', 404)

    if (job.requestedByUserId !== userId && role !== 'super_admin') {
      throw new AppError('FORBIDDEN', 'Bu export\'a erişim yetkiniz yok.', 403)
    }

    const downloadUrl = job.status === 'completed'
      ? `/api/v1/reports/export/${jobId}/download`
      : undefined

    return reply.send({
      jobId:       job.id,
      status:      job.status as 'pending' | 'processing' | 'completed' | 'failed',
      format:      job.format,
      createdAt:   job.createdAt.toISOString(),
      expiresAt:   job.expiresAt?.toISOString() ?? null,
      downloadUrl,
    })
  })

  // GET /api/v1/reports/export/:jobId/download — dosyayı stream et
  app.get('/export/:jobId/download', {
    preHandler: [authenticate],
    schema: { tags: ['Reports'], summary: 'Export dosyasını indir' },
  }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    const { userId, role } = request.user

    const [job] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId))
    if (!job) throw new AppError('NOT_FOUND', 'Export job bulunamadı.', 404)

    if (job.requestedByUserId !== userId && role !== 'super_admin') {
      throw new AppError('FORBIDDEN', 'Bu export\'a erişim yetkiniz yok.', 403)
    }

    if (job.status !== 'completed' || !job.filePath) {
      throw new AppError('BAD_REQUEST', `Export henüz hazır değil: ${job.status}`, 400)
    }

    if (job.expiresAt && job.expiresAt < new Date()) {
      return reply.status(410).send({ error: 'Export süresi doldu.' })
    }

    const date = new Date().toISOString().split('T')[0]
    const ext  = job.format === 'xlsx' ? 'xlsx' : 'csv'
    const mime = job.format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv'

    reply.header('Content-Type', mime)
    reply.header('Content-Disposition', `attachment; filename="transactions-export-${date}.${ext}"`)

    if (!fs.existsSync(job.filePath)) {
      return reply.status(404).send({ error: 'Export dosyası bulunamadı.' })
    }

    const stream = fs.createReadStream(job.filePath)
    return reply.send(stream)
  })

  // GET /api/v1/reports/merchant-daily — günlük merchant ciro raporu (tenant_admin + super_admin)
  app.get('/merchant-daily', {
    preHandler: [authenticate],
    schema: {
      querystring: MerchantDailyReportQuerySchema,
      response:    { 200: MerchantDailyReportResponseSchema },
      tags:        ['Reports'],
      summary:     'Günlük merchant ciro raporu',
    },
  }, async (request, reply) => {
    const { role, tenantId: callerTenantId } = request.user

    if (!['tenant_admin', 'super_admin'].includes(role)) {
      throw new AppError('FORBIDDEN', 'Bu rapora erişim yetkiniz yok.', 403)
    }

    const result = await reportService.getMerchantDailyReport({
      role,
      callerTenantId,
      ...request.query,
    })

    return reply.send({ data: result })
  })

  // GET /api/v1/reports/callbacks — callback başarı raporu (yalnızca super_admin)
  app.get('/callbacks', {
    preHandler: [authenticate, requireSuperAdmin],
    schema: {
      querystring: CallbackReportQuerySchema,
      response:    { 200: CallbackReportResponseSchema },
      tags:        ['Reports'],
      summary:     'Callback başarı raporu',
    },
  }, async (request, reply) => {
    const { tenantId } = request.query
    const result = await reportService.getCallbackReport(tenantId)
    return reply.send({ data: result })
  })
}
