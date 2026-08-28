import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { userRoleEnum } from './users'

export const auditLogs = pgTable('audit_logs', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  userId:       uuid('user_id').notNull(),     // FK YOK: kullanıcı silinse bile log korunur
  userRole:     userRoleEnum('user_role').notNull(),
  action:       text('action').notNull(),      // 'tenant.created', 'user.blocked' vb.
  resourceType: text('resource_type').notNull(), // 'tenant', 'user'
  resourceId:   text('resource_id'),           // ilgili kaynağın UUID'si (nullable)
  ip:           text('ip').notNull(),
  changes:      jsonb('changes'),              // { before?: object, after?: object } veya { ... }
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // ÖNEMLİ: updatedAt YOK — write-once tablo
})

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
