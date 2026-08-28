import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const exportJobs = pgTable('export_jobs', {
  id:                uuid('id').primaryKey().defaultRandom(),
  status:            text('status').notNull().default('pending'), // pending | processing | completed | failed
  format:            text('format').notNull(),                    // csv | xlsx
  filters:           jsonb('filters').notNull().default('{}'),
  filePath:          text('file_path'),
  requestedByUserId: uuid('requested_by_user_id').notNull(),
  tenantId:          uuid('tenant_id'),                           // null = super_admin cross-tenant
  role:              text('role').notNull(),
  errorMessage:      text('error_message'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt:         timestamp('expires_at', { withTimezone: true }),
})

export type ExportJob    = typeof exportJobs.$inferSelect
export type NewExportJob = typeof exportJobs.$inferInsert
