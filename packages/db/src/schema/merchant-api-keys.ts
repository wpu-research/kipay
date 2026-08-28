import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { merchants } from './merchants'

export const apiKeyStatusEnum = pgEnum('api_key_status', ['active', 'revoked'])

export const merchantApiKeys = pgTable('merchant_api_keys', {
  id:         uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  keyId:           text('key_id').notNull(),
  secretEncrypted: text('secret_encrypted').notNull(),
  label:      text('label'),
  status:     apiKeyStatusEnum('status').notNull().default('active'),
  revokedAt:  timestamp('revoked_at', { withTimezone: true }),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('merchant_api_keys_key_id_unique').on(t.keyId),
])

export type MerchantApiKey    = typeof merchantApiKeys.$inferSelect
export type NewMerchantApiKey = typeof merchantApiKeys.$inferInsert
