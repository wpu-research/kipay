import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middleware/auth.js'
import { requireSuperAdmin, requireTenantStaff } from '../../middleware/roles.js'
import { auditLogService } from './audit.service.js'
import {
  AuditLogListFilterSchema,
  AuditLogListResponseSchema,
  AuditLogExportSchema,
} from '@panel/types'

export async function auditRoutes(app: FastifyInstance) {

  // GET /api/v1/audit-logs — tenant_admin/finans_admin/finans_operator/super_admin
  app.get('/', {
    preHandler: [authenticate, requireTenantStaff],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Audit Logs'],
      summary: 'Audit log listesi',
      querystring: AuditLogListFilterSchema,
      response: { 200: AuditLogListResponseSchema },
    },
  }, async (request) => {
    const { page = 1, limit = 20, from, to, action, userId, resourceId, resourceType, tenantId: queryTenantId } = request.query as {
      page?: number; limit?: number; from?: string; to?: string;
      action?: string; userId?: string; resourceId?: string; resourceType?: string; tenantId?: string
    }

    // Tenant izolasyonu: firma kendi tenantId'sini kullanır, super_admin query param'ı
    const tenantId = request.user.role === 'super_admin'
      ? (queryTenantId ?? null)
      : request.user.tenantId

    // finans rolleri sadece transaction loglarını görebilir
    const effectiveResourceType = ['finans_admin', 'finans_operator'].includes(request.user.role)
      ? 'transaction'
      : resourceType

    const { data, meta } = await auditLogService.getAuditLogs(
      tenantId,
      { from, to, action, userId, resourceId, resourceType: effectiveResourceType },
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

  // POST /api/v1/audit-logs/export — CSV veya Excel export
  app.post('/export', {
    preHandler: [authenticate, requireSuperAdmin],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      tags: ['Audit Logs'],
      summary: 'Audit log export',
      body: AuditLogExportSchema,
    },
  }, async (request, reply) => {
    const { format, from, to, action, userId, resourceType, tenantId: bodyTenantId } = request.body as {
      format: 'csv' | 'xlsx'; from?: string; to?: string;
      action?: string; userId?: string; resourceType?: string; tenantId?: string
    }

    // super_admin: body'deki tenantId filtresi uygulanır (yoksa tümü); firma: kendi tenantId'si
    const tenantId = request.user.role === 'super_admin'
      ? (bodyTenantId ?? null)
      : request.user.tenantId

    const { buffer, filename, mimeType } = await auditLogService.exportAuditLogs(
      tenantId,
      { from, to, action, userId, resourceType },
      format,
    )

    return reply
      .header('Content-Type', mimeType)
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(buffer)
  })
}
