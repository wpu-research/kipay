import { pgTable, uuid, text, numeric, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { merchants } from './merchants'
import { transactions } from './transactions'

export const warningRules = pgTable('warning_rules', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id),
  merchantId:    uuid('merchant_id').references(() => merchants.id), // null = tenant scope
  ruleType:      text('rule_type').notNull(), // 'transaction_frequency' | 'amount_threshold' | 'repeat_rejection'
  threshold:     numeric('threshold').notNull(), // miktar (amount_threshold) veya sayı (frequency/rejection)
  windowMinutes: integer('window_minutes'),     // frequency ve repeat_rejection kuralları için zaman penceresi
  isActive:      boolean('is_active').notNull().default(true),
  createdBy:     uuid('created_by').notNull(),  // FK yok: kullanıcı silinse bile kayıt korunur
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const warnings = pgTable('warnings', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').notNull().references(() => tenants.id),
  ruleId:         uuid('rule_id').notNull().references(() => warningRules.id),
  transactionId:  uuid('transaction_id').references(() => transactions.id), // null = manuel tetik
  status:         text('status').notNull().default('open'), // 'open' | 'acknowledged'
  triggeredAt:    timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
  acknowledgedBy: uuid('acknowledged_by'),  // FK yok
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  metadata:       jsonb('metadata'),        // { ruleType, threshold, actualValue, merchantId? }
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type WarningRule    = typeof warningRules.$inferSelect
export type NewWarningRule = typeof warningRules.$inferInsert
export type Warning        = typeof warnings.$inferSelect
export type NewWarning     = typeof warnings.$inferInsert
