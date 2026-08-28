import { pgTable, uuid, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { transactions } from './transactions'

export const notifications = pgTable('notifications', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id),
  userId:        uuid('user_id').notNull().references(() => users.id),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  type:          text('type').notNull(), // 'transaction.pending'
  payload:       jsonb('payload').notNull(),
  isRead:        boolean('is_read').notNull().default(false),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_notifications_user_id').on(t.userId),
  index('idx_notifications_tenant_id').on(t.tenantId),
  index('idx_notifications_is_read').on(t.isRead),
])

export type Notification    = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
