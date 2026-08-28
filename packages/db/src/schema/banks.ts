import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core'

export const banks = pgTable('banks', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull().unique(),
  ibanCode:  text('iban_code'),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Bank    = typeof banks.$inferSelect
export type NewBank = typeof banks.$inferInsert
