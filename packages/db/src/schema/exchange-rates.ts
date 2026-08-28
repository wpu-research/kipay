import { pgTable, uuid, text, timestamp, decimal } from 'drizzle-orm/pg-core'

export const exchangeRates = pgTable('exchange_rates', {
  id:           uuid('id').primaryKey().defaultRandom(),
  fromCurrency: text('from_currency').notNull(),
  toCurrency:   text('to_currency').notNull(),
  rate:         decimal('rate', { precision: 18, scale: 8 }).notNull(),
  source:       text('source').notNull(), // 'coinmarketcap' | 'binance' | 'coingecko' | 'manual'
  fetchedAt:    timestamp('fetched_at', { withTimezone: true }).notNull(),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ExchangeRate    = typeof exchangeRates.$inferSelect
export type NewExchangeRate = typeof exchangeRates.$inferInsert
