import { pgTable, uuid, integer, boolean, text, timestamp } from 'drizzle-orm/pg-core'
import { transactions } from './transactions'

export const callbackLogs = pgTable('callback_logs', {
  id:             uuid('id').primaryKey().defaultRandom(),
  transactionId:  uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  attemptNumber:  integer('attempt_number').notNull(),
  sentAt:         timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  responseStatus: integer('response_status'),
  responseBody:   text('response_body'),
  success:        boolean('success').notNull(),
  errorMessage:   text('error_message'),
})

export type CallbackLog    = typeof callbackLogs.$inferSelect
export type NewCallbackLog = typeof callbackLogs.$inferInsert
