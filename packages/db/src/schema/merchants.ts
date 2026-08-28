import { pgTable, uuid, text, timestamp, pgEnum, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const merchantStatusEnum = pgEnum('merchant_status', ['active', 'inactive'])

export const merchants = pgTable('merchants', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').notNull().references(() => tenants.id),
  merchantName:   text('merchant_name').notNull(),
  webhookUrl:     text('webhook_url').notNull(),
  isSandbox:      boolean('is_sandbox').notNull().default(true),
  status:         merchantStatusEnum('status').notNull().default('active'),
  callbackSecret: text('callback_secret'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('merchants_tenant_name_unique').on(t.tenantId, t.merchantName),
])

export type Merchant    = typeof merchants.$inferSelect
export type NewMerchant = typeof merchants.$inferInsert
