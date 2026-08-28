import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'

export const paymentProviderCategories = pgTable('payment_provider_categories', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id),
  name:      text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('payment_provider_categories_tenant_name_unique').on(t.tenantId, t.name),
])

export type PaymentProviderCategory    = typeof paymentProviderCategories.$inferSelect
export type NewPaymentProviderCategory = typeof paymentProviderCategories.$inferInsert
