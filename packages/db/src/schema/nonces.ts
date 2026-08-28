import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

export const nonces = pgTable('nonces', {
  nonce:     text('nonce').primaryKey(),
  keyId:     text('key_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_nonces_expires_at').on(t.expiresAt),
])

export type Nonce    = typeof nonces.$inferSelect
export type NewNonce = typeof nonces.$inferInsert
