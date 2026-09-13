import { pgTable, uuid, text, timestamp, decimal, date, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { merchants } from './merchants'
import { users } from './users'

/**
 * Günlük mutabakat — elle girilen gerçek para hareketi.
 *
 * Raporda "Bize Ödenen Tutar" / "Birim Ödediğimiz Tutar" satırları buradan gelir;
 * işlem verisinden hesaplanmaz, gün sonunda operasyon elle girer ve komisyon
 * hesabıyla karşılaştırılır.
 */
export const dailySettlements = pgTable('daily_settlements', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id, { onDelete: 'cascade' }),
  /** Mutabakat günü (tarih, saat yok). */
  settlementDate: date('settlement_date').notNull(),
  /** Merchant'ın bize ödediği tutar. */
  paidToUs:  decimal('paid_to_us',  { precision: 18, scale: 2 }).notNull().default('0'),
  /** Bizim merchant'a ödediğimiz tutar. */
  paidByUs:  decimal('paid_by_us',  { precision: 18, scale: 2 }).notNull().default('0'),
  note:      text('note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex('daily_settlements_merchant_date_unique').on(t.merchantId, t.settlementDate),
  index('daily_settlements_tenant_date_idx').on(t.tenantId, t.settlementDate),
])

export type DailySettlement    = typeof dailySettlements.$inferSelect
export type NewDailySettlement = typeof dailySettlements.$inferInsert
