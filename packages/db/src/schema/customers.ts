import { pgTable, uuid, text, timestamp, integer, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { merchants } from './merchants'

/**
 * Son kullanıcı (oyuncu) kayıt defteri — ödeme yapan herkesin isim/soyisim/telefon
 * (ve TC) bilgisi merkezi olarak burada tutulur.
 *
 * Tekilleştirme: (merchant_id, external_user_id). Aynı kişi farklı sitelerde ayrı
 * kayıt olur. KYC bilgisi her yatırım initiate'inde güncellenir (en son değer kazanır),
 * lastSeenAt ve depositCount güncellenir.
 */
export const customers = pgTable('customers', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').notNull().references(() => tenants.id),
  merchantId:     uuid('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  externalUserId: text('external_user_id').notNull(),
  identityNumber: text('identity_number'),
  firstName:      text('first_name'),
  lastName:       text('last_name'),
  phone:          text('phone'),
  depositCount:   integer('deposit_count').notNull().default(0),
  firstSeenAt:    timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:     timestamp('last_seen_at',  { withTimezone: true }).notNull().defaultNow(),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('customers_merchant_external_user_unique').on(t.merchantId, t.externalUserId),
  index('customers_tenant_id_idx').on(t.tenantId),
  index('customers_identity_number_idx').on(t.identityNumber),
  index('customers_phone_idx').on(t.phone),
])

export type Customer    = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
