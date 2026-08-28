import { z } from 'zod'
import { PaginationMetaSchema } from './common.js'

export const AuditLogSchema = z.object({
  id:           z.string().uuid(),
  tenantId:     z.string().uuid(),
  userId:       z.string().uuid(),
  userRole:     z.enum(['super_admin', 'tenant_admin', 'finans_admin', 'finans_operator', 'merchant']),
  action:       z.string(),
  resourceType: z.string(),
  resourceId:   z.string().nullable(),
  ip:           z.string(),
  changes:      z.unknown().nullable(),                 // jsonb — serbest yapı
  timestamp:    z.string().datetime({ offset: true }),  // createdAt ISO 8601 UTC alias
})

// ISO 8601 tarih veya datetime kabul eder: '2026-03-21' veya '2026-03-21T10:00:00Z'
const dateOrDatetime = z.union([
  z.string().date(),                      // YYYY-MM-DD (date-only)
  z.string().datetime({ offset: true }),  // ISO 8601 datetime
])

// from <= to doğrulaması — tüm filtre şemalarında ortak kullanım
function validateDateRange(data: { from?: string; to?: string }, ctx: z.RefinementCtx) {
  if (data.from && data.to) {
    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
    const fromDate = new Date(DATE_ONLY.test(data.from) ? data.from + 'T00:00:00.000Z' : data.from)
    const toDate   = new Date(DATE_ONLY.test(data.to)   ? data.to   + 'T23:59:59.999Z' : data.to)
    if (fromDate > toDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '"from" tarihi "to" tarihinden sonra olamaz', path: ['from'] })
    }
  }
}

// Audit log listesi sorgusu için query param şeması
export const AuditLogFilterSchema = z.object({
  page:   z.coerce.number().int().min(1).max(1000).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  from:   dateOrDatetime.optional(),
  to:     dateOrDatetime.optional(),
  action: z.string().optional(),
}).superRefine(validateDateRange)

export const AuditLogListResponseSchema = z.object({
  data: z.array(AuditLogSchema),
  meta: PaginationMetaSchema,
})

// Middleware'in route handler'lardan alacağı bilgi
export const AuditEntryInputSchema = z.object({
  action:       z.string(),
  resourceType: z.string(),
  resourceId:   z.string().optional(),
  changes:      z.unknown().optional(),
  tenantId:     z.string().uuid(),        // log hangi tenant'a ait
})

export type AuditLog = z.infer<typeof AuditLogSchema>
export type AuditLogFilter = z.infer<typeof AuditLogFilterSchema>
export type AuditLogListResponse = z.infer<typeof AuditLogListResponseSchema>
export type AuditEntryInput = z.infer<typeof AuditEntryInputSchema>

// Genel audit log liste filtresi (GET /api/v1/audit-logs için)
export const AuditLogListFilterSchema = z.object({
  page:         z.coerce.number().int().min(1).max(1000).default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
  from:         dateOrDatetime.optional(),
  to:           dateOrDatetime.optional(),
  action:       z.string().optional(),
  userId:       z.string().uuid().optional(),
  resourceId:   z.string().uuid().optional(),
  resourceType: z.string().optional(),
  tenantId:     z.string().uuid().optional(), // super_admin only
}).superRefine(validateDateRange)
export type AuditLogListFilter = z.infer<typeof AuditLogListFilterSchema>

// Export endpoint body şeması
export const AuditLogExportSchema = z.object({
  format:       z.enum(['csv', 'xlsx']),
  from:         dateOrDatetime.optional(),
  to:           dateOrDatetime.optional(),
  action:       z.string().optional(),
  userId:       z.string().uuid().optional(),
  resourceType: z.string().optional(),
  tenantId:     z.string().uuid().optional(), // super_admin only
}).superRefine(validateDateRange)
export type AuditLogExportInput = z.infer<typeof AuditLogExportSchema>
