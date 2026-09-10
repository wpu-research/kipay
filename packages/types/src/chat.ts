import { z } from 'zod'

export const ChatConversationTypeEnum = z.enum(['channel', 'direct', 'transaction'])
export type ChatConversationType = z.infer<typeof ChatConversationTypeEnum>

export const ChatUserSchema = z.object({
  id:       z.string().uuid(),
  username: z.string(),
  role:     z.string(),
})
export type ChatUser = z.infer<typeof ChatUserSchema>

export const ChatAttachmentMetaSchema = z.object({
  id:   z.string().uuid(),
  name: z.string(),
  mime: z.string(),
  size: z.number().int(),
})
export type ChatAttachmentMeta = z.infer<typeof ChatAttachmentMetaSchema>

export const ChatMessageSchema = z.object({
  id:             z.string().uuid(),
  conversationId: z.string().uuid(),
  sender:         ChatUserSchema.nullable(),
  content:        z.string(),
  attachments:    z.array(ChatAttachmentMetaSchema),
  replyTo:        z.object({
    id:      z.string().uuid(),
    content: z.string(),
    sender:  ChatUserSchema.nullable(),
  }).nullable(),
  isSystem:  z.boolean(),
  editedAt:  z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ChatConversationSchema = z.object({
  id:            z.string().uuid(),
  type:          ChatConversationTypeEnum,
  name:          z.string(),               // direct'te karşı tarafın adı, transaction'da kısa id
  isPrivate:     z.boolean(),
  transactionId: z.string().uuid().nullable(),
  members:       z.array(ChatUserSchema),
  isMember:      z.boolean(),
  unreadCount:   z.number().int(),
  lastMessage:   z.object({
    content:   z.string(),
    sender:    z.string().nullable(),
    createdAt: z.string(),
  }).nullable(),
  lastMessageAt: z.string().nullable(),
  createdAt:     z.string(),
})
export type ChatConversation = z.infer<typeof ChatConversationSchema>

export const ChatConversationListResponseSchema = z.object({ data: z.array(ChatConversationSchema) })
export const ChatConversationResponseSchema     = z.object({ data: ChatConversationSchema })
export const ChatMessageListResponseSchema      = z.object({
  data:    z.array(ChatMessageSchema),
  hasMore: z.boolean(),
})
export const ChatMessageResponseSchema = z.object({ data: ChatMessageSchema })
export const ChatUserListResponseSchema = z.object({ data: z.array(ChatUserSchema) })
export const ChatUnreadResponseSchema   = z.object({ total: z.number().int() })

export const CreateChatConversationSchema = z.discriminatedUnion('type', [
  z.object({
    type:      z.literal('channel'),
    name:      z.string().min(2).max(64).regex(/^[\p{L}\p{N} _\-]+$/u, 'Kanal adı harf, rakam, boşluk, tire ve alt çizgi içerebilir'),
    isPrivate: z.boolean().default(false),
    memberIds: z.array(z.string().uuid()).default([]),
  }),
  z.object({
    type:   z.literal('direct'),
    userId: z.string().uuid(),
  }),
  z.object({
    type:          z.literal('transaction'),
    transactionId: z.string().uuid(),
  }),
])
export type CreateChatConversationInput = z.infer<typeof CreateChatConversationSchema>

export const SendChatMessageSchema = z.object({
  content:       z.string().max(4000).default(''),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
  replyToId:     z.string().uuid().nullable().optional(),
}).refine((d) => d.content.trim().length > 0 || d.attachmentIds.length > 0, { message: 'Mesaj boş olamaz.' })
export type SendChatMessageInput = z.infer<typeof SendChatMessageSchema>

export const EditChatMessageSchema = z.object({ content: z.string().min(1).max(4000) })

export const UploadChatAttachmentSchema = z.object({
  name:       z.string().min(1).max(200),
  mime:       z.string().min(1).max(100),
  dataBase64: z.string().min(1),
})
export const UploadChatAttachmentResponseSchema = z.object({ data: ChatAttachmentMetaSchema })

export const AddChatMembersSchema = z.object({ userIds: z.array(z.string().uuid()).min(1).max(50) })

export type ChatConversationListResponse = z.infer<typeof ChatConversationListResponseSchema>
export type ChatMessageListResponse      = z.infer<typeof ChatMessageListResponseSchema>
