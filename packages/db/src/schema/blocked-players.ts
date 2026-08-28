import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { merchants } from './merchants'

export const blockedPlayers = pgTable('blocked_players', {
  id:             uuid('id').primaryKey().defaultRandom(),
  tenantId:       uuid('tenant_id').notNull().references(() => tenants.id),
  merchantId:     uuid('merchant_id').notNull().references(() => merchants.id),
  externalUserId: text('external_user_id').notNull(),
  blockedUntil:   timestamp('blocked_until', { withTimezone: true }),  // null = kalıcı
  isPermanent:    boolean('is_permanent').notNull().default(false),
  createdBy:      uuid('created_by').notNull(),   // FK yok: kullanıcı silinse bile kayıt korunur
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // checkPlayerBlocked hot-path sorgusu için (merchant_id, external_user_id)
  index('blocked_players_merchant_player_idx').on(t.merchantId, t.externalUserId),
  // Listeleme için tenant + createdAt DESC indeksi
  index('blocked_players_tenant_created_idx').on(t.tenantId, t.createdAt),
])

export type BlockedPlayer = typeof blockedPlayers.$inferSelect
export type NewBlockedPlayer = typeof blockedPlayers.$inferInsert
