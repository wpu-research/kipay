import { pgTable, uuid, text, timestamp, pgEnum, decimal, boolean, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { merchants } from './merchants'
import { paymentAccounts } from './payment-accounts'
import { users } from './users'

export const transactionStatusEnum = pgEnum('transaction_status', [
  'STARTED', 'PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'COMPLETED', 'FLAGGED',
  'TIMEOUT', 'CANCELLED',
])

export const transactionTypeEnum = pgEnum('transaction_type', ['deposit', 'withdrawal'])

export const transactions = pgTable('transactions', {
  id:               uuid('id').primaryKey().defaultRandom(),
  tenantId:         uuid('tenant_id').notNull().references(() => tenants.id),
  merchantId:       uuid('merchant_id').notNull().references(() => merchants.id),
  paymentAccountId: uuid('payment_account_id').references(() => paymentAccounts.id),
  externalUserId:   text('external_user_id').notNull(),
  amount:           decimal('amount', { precision: 18, scale: 2 }).notNull(),
  currency:         text('currency').notNull(),
  status:           transactionStatusEnum('status').notNull().default('STARTED'),
  type:             transactionTypeEnum('type').notNull().default('deposit'),
  startedExpiresAt: timestamp('started_expires_at', { withTimezone: true }),
  paymentMethod:          text('payment_method'),
  withdrawalAddress:      text('withdrawal_address'),
  withdrawalAccountName:  text('withdrawal_account_name'),
  // v1.1 userInfo — üye kimlik bloğu (KVKK: panelde maskeli göster)
  userIdentityNumber: text('user_identity_number'),
  userMemberId:       text('user_member_id'),
  userFirstName:      text('user_first_name'),
  userMiddleName:     text('user_middle_name').default(''),
  userLastName:       text('user_last_name'),
  userPhone:          text('user_phone'),
  claimedBy:        uuid('claimed_by').references(() => users.id),
  claimedAt:        timestamp('claimed_at', { withTimezone: true }),
  claimExpiresAt:   timestamp('claim_expires_at', { withTimezone: true }),
  resolvedBy:       uuid('resolved_by').references(() => users.id),
  resolvedAt:       timestamp('resolved_at', { withTimezone: true }),
  callbackStatus:      text('callback_status'),
  exchangeRate:        decimal('exchange_rate', { precision: 18, scale: 8 }),
  amountTry:           decimal('amount_try', { precision: 18, scale: 2 }),
  note:                text('note'),
  playerConfirmed:     boolean('player_confirmed').notNull().default(false),
  playerConfirmedAt:   timestamp('player_confirmed_at', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('idx_transactions_status').on(t.status),
  index('idx_transactions_tenant_id').on(t.tenantId),
  index('idx_transactions_merchant_id').on(t.merchantId),
  index('idx_transactions_payment_account_id').on(t.paymentAccountId),
  index('idx_transactions_claimed_by').on(t.claimedBy),
])

export type Transaction     = typeof transactions.$inferSelect
export type NewTransaction  = typeof transactions.$inferInsert
export type TransactionType = 'deposit' | 'withdrawal'
