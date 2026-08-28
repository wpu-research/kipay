import { pgTable, uuid, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { merchants } from './merchants'

export const userRoleEnum = pgEnum('user_role', ['super_admin', 'tenant_admin', 'finans_admin', 'finans_operator', 'merchant'])
export const userStatusEnum = pgEnum('user_status', ['active', 'inactive'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull(),
  totpSecret: text('totp_secret'),
  status:               userStatusEnum('status').notNull().default('active'),
  isPermanentlyBlocked: boolean('is_permanently_blocked').notNull().default(false),
  blockedUntil:         timestamp('blocked_until', { withTimezone: true }),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
