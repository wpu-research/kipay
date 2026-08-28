import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core'
import { transactions } from './transactions'
import { tenants } from './tenants'
import { users } from './users'

export const transactionComments = pgTable('transaction_comments', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id),
  userId:        uuid('user_id').notNull().references(() => users.id),
  userRole:      text('user_role').notNull(),
  content:       text('content').notNull(),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_transaction_comments_transaction_id').on(t.transactionId),
  index('idx_transaction_comments_tenant_id').on(t.tenantId),
])

export type TransactionComment    = typeof transactionComments.$inferSelect
export type NewTransactionComment = typeof transactionComments.$inferInsert
