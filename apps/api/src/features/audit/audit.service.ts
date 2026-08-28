import { db, auditLogs, eq, and, gte, lte, sql } from '@panel/db'
import type { NewAuditLog } from '@panel/db'
import type { AuditEntryInput } from '@panel/types'
import { AppError } from '../../errors/app-error.js'

export const auditLogService = {

  // write-once INSERT — sadece bu method kullanılır, update/delete methodu YOK
  async createAuditLog(entry: AuditEntryInput & {
    userId:   string
    userRole: string
    ip:       string
  }) {
    await db.insert(auditLogs).values({
      tenantId:     entry.tenantId,
      userId:       entry.userId,
      userRole:     entry.userRole as NewAuditLog['userRole'],
      action:       entry.action,
      resourceType: entry.resourceType,
      resourceId:   entry.resourceId ?? null,
      ip:           entry.ip,
      changes:      entry.changes ?? null,
    })
    // Hata durumunda log yazmak request'i engellememelidir — caller'da try/catch kullan
  },

  async getTenantAuditLogs(
    tenantId: string,
    filters: { from?: string; to?: string; action?: string },
    pagination: { page: number; limit: number },
  ) {
    const { page, limit } = pagination
    const offset = (page - 1) * limit

    // Date-only değerleri (YYYY-MM-DD) için araç ucu normalizasyonu:
    // from=2026-03-21 → günün başı 00:00:00Z; to=2026-03-21 → günün sonu 23:59:59.999Z
    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
    const parseFrom = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T00:00:00.000Z') : new Date(v)
    const parseTo   = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T23:59:59.999Z') : new Date(v)

    const conditions = [eq(auditLogs.tenantId, tenantId)]
    if (filters.from)   conditions.push(gte(auditLogs.createdAt, parseFrom(filters.from)))
    if (filters.to)     conditions.push(lte(auditLogs.createdAt, parseTo(filters.to)))
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action))

    const where = conditions.length === 1 ? conditions[0]! : and(...conditions)

    // Window function: count ve data tek sorguda alınır — snapshot tutarsızlığı giderilir
    const rows = await db
      .select({
        id:           auditLogs.id,
        tenantId:     auditLogs.tenantId,
        userId:       auditLogs.userId,
        userRole:     auditLogs.userRole,
        action:       auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId:   auditLogs.resourceId,
        ip:           auditLogs.ip,
        changes:      auditLogs.changes,
        createdAt:    auditLogs.createdAt,
        totalCount:   sql<number>`count(*) OVER()::int`,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(auditLogs.createdAt)  // en eski → en yeni (kronolojik)
      .limit(limit)
      .offset(offset)

    let total: number
    if (rows.length > 0) {
      total = rows[0]!.totalCount
    } else {
      // Out-of-range sayfa: window count boş döner, ayrı sorgu ile gerçek toplam alınır
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(where)
      total = countRow?.count ?? 0
    }
    const data  = rows.map(({ totalCount: _tc, ...rest }) => rest)

    return { data, meta: { total, page, limit } }
  },

  async getAuditLogs(
    tenantId: string | null,
    filters: { from?: string; to?: string; action?: string; userId?: string; resourceId?: string; resourceType?: string },
    pagination: { page: number; limit: number },
  ) {
    const { page, limit } = pagination
    const offset = (page - 1) * limit

    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
    const parseFrom = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T00:00:00.000Z') : new Date(v)
    const parseTo   = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T23:59:59.999Z') : new Date(v)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = []
    if (tenantId)             conditions.push(eq(auditLogs.tenantId, tenantId))
    if (filters.from)         conditions.push(gte(auditLogs.createdAt, parseFrom(filters.from)))
    if (filters.to)           conditions.push(lte(auditLogs.createdAt, parseTo(filters.to)))
    if (filters.action)       conditions.push(eq(auditLogs.action, filters.action))
    if (filters.userId)       conditions.push(eq(auditLogs.userId, filters.userId))
    if (filters.resourceId)   conditions.push(eq(auditLogs.resourceId, filters.resourceId))
    if (filters.resourceType) conditions.push(eq(auditLogs.resourceType, filters.resourceType))

    const where = conditions.length === 0 ? undefined
      : conditions.length === 1 ? conditions[0]!
      : and(...conditions)

    const rows = await db
      .select({
        id:           auditLogs.id,
        tenantId:     auditLogs.tenantId,
        userId:       auditLogs.userId,
        userRole:     auditLogs.userRole,
        action:       auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId:   auditLogs.resourceId,
        ip:           auditLogs.ip,
        changes:      auditLogs.changes,
        createdAt:    auditLogs.createdAt,
        totalCount:   sql<number>`count(*) OVER()::int`,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(auditLogs.createdAt)
      .limit(limit)
      .offset(offset)

    let total: number
    if (rows.length > 0) {
      total = rows[0]!.totalCount
    } else {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(where)
      total = countRow?.count ?? 0
    }
    const data = rows.map(({ totalCount: _tc, ...rest }) => rest)
    return { data, meta: { total, page, limit } }
  },

  async exportAuditLogs(
    tenantId: string | null,
    filters: { from?: string; to?: string; action?: string; userId?: string; resourceType?: string },
    format: 'csv' | 'xlsx',
  ): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const EXPORT_LIMIT = 10_000

    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
    const parseFrom = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T00:00:00.000Z') : new Date(v)
    const parseTo   = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T23:59:59.999Z') : new Date(v)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conditions: any[] = []
    if (tenantId)             conditions.push(eq(auditLogs.tenantId, tenantId))
    if (filters.from)         conditions.push(gte(auditLogs.createdAt, parseFrom(filters.from)))
    if (filters.to)           conditions.push(lte(auditLogs.createdAt, parseTo(filters.to)))
    if (filters.action)       conditions.push(eq(auditLogs.action, filters.action))
    if (filters.userId)       conditions.push(eq(auditLogs.userId, filters.userId))
    if (filters.resourceType) conditions.push(eq(auditLogs.resourceType, filters.resourceType))

    const where = conditions.length === 0 ? undefined
      : conditions.length === 1 ? conditions[0]!
      : and(...conditions)

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where)
    const total = countRow?.count ?? 0
    if (total > EXPORT_LIMIT) {
      throw new AppError('EXPORT_LIMIT_EXCEEDED', `Export limiti aşıldı: ${total} kayıt, maksimum ${EXPORT_LIMIT}.`, 400)
    }

    const rows = await db
      .select({
        id:           auditLogs.id,
        tenantId:     auditLogs.tenantId,
        userId:       auditLogs.userId,
        userRole:     auditLogs.userRole,
        action:       auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId:   auditLogs.resourceId,
        ip:           auditLogs.ip,
        changes:      auditLogs.changes,
        createdAt:    auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(auditLogs.createdAt)
      .limit(EXPORT_LIMIT)

    const date    = new Date().toISOString().split('T')[0]!
    const headers = ['ID', 'Tenant ID', 'User ID', 'Role', 'Action', 'Resource Type', 'Resource ID', 'IP', 'Changes', 'Timestamp']
    const rowData = rows.map(r => [
      r.id, r.tenantId, r.userId, r.userRole, r.action,
      r.resourceType, r.resourceId ?? '', r.ip,
      r.changes != null ? JSON.stringify(r.changes) : '',
      r.createdAt.toISOString(),
    ])

    if (format === 'csv') {
      const csvRows = [headers, ...rowData].map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      return {
        buffer:   Buffer.from(csvRows.join('\n'), 'utf-8'),
        filename: `audit-logs-${date}.csv`,
        mimeType: 'text/csv',
      }
    } else {
      const xlsx = await import('xlsx')
      const ws = xlsx.utils.aoa_to_sheet([headers, ...rowData])
      const wb = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(wb, ws, 'Audit Logs')
      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
      return {
        buffer,
        filename: `audit-logs-${date}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }
    }
  },
}
