import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core'

export const cryptos = pgTable('cryptos', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull().unique(),
  symbol:    text('symbol').notNull().unique(),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Crypto    = typeof cryptos.$inferSelect
export type NewCrypto = typeof cryptos.$inferInsert
