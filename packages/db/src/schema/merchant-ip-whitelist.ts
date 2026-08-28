import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { merchants } from './merchants'

export const merchantIpWhitelist = pgTable('merchant_ip_whitelist', {
  id:         uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  ipAddress:  text('ip_address').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('merchant_ip_whitelist_unique').on(t.merchantId, t.ipAddress),
])

export type MerchantIpEntry    = typeof merchantIpWhitelist.$inferSelect
export type NewMerchantIpEntry = typeof merchantIpWhitelist.$inferInsert
