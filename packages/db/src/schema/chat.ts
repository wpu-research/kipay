import { pgTable, uuid, text, timestamp, pgEnum, boolean, integer, jsonb, primaryKey, index, customType } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'
import { transactions } from './transactions'

export const chatConversationTypeEnum = pgEnum('chat_conversation_type', ['channel', 'direct', 'transaction'])

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return 'bytea' },
})

export interface ChatAttachmentMeta {
  id:   string
  name: string
  mime: string
  size: number
}

export const chatConversations = pgTable('chat_conversations', {
  id:            uuid('id').primaryKey().defaultRandom(),
  tenantId:      uuid('tenant_id').notNull().references(() => tenants.id),
  type:          chatConversationTypeEnum('type').notNull(),
  name:          text('name'),
  isPrivate:     boolean('is_private').notNull().default(false),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'cascade' }),
  directKey:     text('direct_key'),
  createdBy:     uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index('chat_conversations_tenant_idx').on(t.tenantId, t.lastMessageAt),
])

export const chatMembers = pgTable('chat_members', {
  conversationId: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  userId:         uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadAt:     timestamp('last_read_at', { withTimezone: true }),
  muted:          boolean('muted').notNull().default(false),
  joinedAt:       timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.conversationId, t.userId] }),
  index('chat_members_user_idx').on(t.userId),
])

export const chatMessages = pgTable('chat_messages', {
  id:             uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  senderId:       uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
  content:        text('content').notNull().default(''),
  attachments:    jsonb('attachments').$type<ChatAttachmentMeta[]>().notNull().default([]),
  replyToId:      uuid('reply_to_id'),
  isSystem:       boolean('is_system').notNull().default(false),
  editedAt:       timestamp('edited_at', { withTimezone: true }),
  deletedAt:      timestamp('deleted_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('chat_messages_conv_created_idx').on(t.conversationId, t.createdAt),
])

export const chatAttachments = pgTable('chat_attachments', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  uploaderId: uuid('uploader_id').references(() => users.id, { onDelete: 'set null' }),
  messageId:  uuid('message_id').references(() => chatMessages.id, { onDelete: 'cascade' }),
  name:       text('name').notNull(),
  mime:       text('mime').notNull(),
  size:       integer('size').notNull(),
  data:       bytea('data').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('chat_attachments_message_idx').on(t.messageId),
])

export type ChatConversation = typeof chatConversations.$inferSelect
export type ChatMember       = typeof chatMembers.$inferSelect
export type ChatMessage      = typeof chatMessages.$inferSelect
export type ChatAttachment   = typeof chatAttachments.$inferSelect
