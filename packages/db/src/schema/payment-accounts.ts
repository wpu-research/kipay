import { pgTable, uuid, text, timestamp, pgEnum, decimal } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { banks } from './banks'
import { users } from './users'

export const paymentAccountStatusEnum      = pgEnum('payment_account_status',      ['active', 'inactive'])
export const paymentAccountEnvironmentEnum = pgEnum('payment_account_environment', ['sandbox', 'production'])
export const paymentAccountTypeEnum        = pgEnum('payment_account_type',        ['bank', 'crypto'])

export const paymentAccounts = pgTable('payment_accounts', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id),
  type:          paymentAccountTypeEnum('type').notNull(),
  bankId:        uuid('bank_id').references(() => banks.id),
  name:          text('name').notNull(),
  accountNumber: text('account_number').notNull(),
  environment:   paymentAccountEnvironmentEnum('environment').notNull(),
  status:        paymentAccountStatusEnum('status').notNull().default('active'),
  dailyLimit:      decimal('daily_limit', { precision: 18, scale: 2 }).notNull(),
  dailyUsed:       decimal('daily_used', { precision: 18, scale: 2 }).notNull().default('0'),
  lastResetAt:     timestamp('last_reset_at', { withTimezone: true }),
  ownedByUserId:   uuid('owned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export type PaymentAccount    = typeof paymentAccounts.$inferSelect
export type NewPaymentAccount = typeof paymentAccounts.$inferInsert
