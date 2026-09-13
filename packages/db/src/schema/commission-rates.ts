import { pgTable, uuid, text, timestamp, decimal, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { merchants } from './merchants'

/**
 * Merchant × ödeme yöntemi bazlı komisyon oranları (yüzde).
 *
 * Yatırım ve çekim için ayrı oran tutulur — gelir/gider raporunda ikisi ayrı kolon.
 * Oran değiştiğinde geçmiş bozulmasın diye işlem onaylanırken oran + tutar
 * transactions tablosuna snapshot olarak yazılır (bkz. transactions.commissionRate).
 */
export const merchantCommissionRates = pgTable('merchant_commission_rates', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  /** 'havale' | 'hizli_havale' | 'kripto' — serbest metin, yeni yöntem migration istemesin diye. */
  paymentMethod: text('payment_method').notNull(),
  /** Yüzde. 3.75 = %3.75 */
  depositRate:    decimal('deposit_rate',    { precision: 5, scale: 2 }).notNull().default('0'),
  withdrawalRate: decimal('withdrawal_rate', { precision: 5, scale: 2 }).notNull().default('0'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('merchant_commission_rates_merchant_method_unique').on(t.merchantId, t.paymentMethod),
  index('merchant_commission_rates_tenant_id_idx').on(t.tenantId),
])

export type MerchantCommissionRate    = typeof merchantCommissionRates.$inferSelect
export type NewMerchantCommissionRate = typeof merchantCommissionRates.$inferInsert
