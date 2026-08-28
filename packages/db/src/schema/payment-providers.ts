import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const paymentProviderStatusEnum = pgEnum('payment_provider_status', ['active', 'inactive'])

export const paymentProviders = pgTable('payment_providers', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id),
  name:      text('name').notNull(),
  status:    paymentProviderStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('payment_providers_tenant_name_unique').on(t.tenantId, t.name),
])

export type PaymentProvider    = typeof paymentProviders.$inferSelect
export type NewPaymentProvider = typeof paymentProviders.$inferInsert
