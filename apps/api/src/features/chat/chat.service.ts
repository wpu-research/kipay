import {
  db, chatConversations, chatMembers, chatMessages, chatAttachments, users, transactions, notifications,
  eq, and, or, sql, inArray, desc, lt, isNull,
} from '@panel/db'
import type { ChatAttachmentMeta } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import * as sseManager from '../../sse/sse-manager.js'
import type { CreateChatConversationInput, SendChatMessageInput } from '@panel/types'

// Sohbete erişebilen roller — merchant ve super_admin (tenant bağlamı yok) hariç
export const CHAT_ROLES = ['tenant_admin', 'finans_admin', 'finans_operator'] as const
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain|text\/csv|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/zip)$/

type Actor = { userId: string; tenantId: string; role: string; username: string }
type UserLite = { id: string; username: string; role: string }

const directKeyFor = (a: string, b: string) => [a, b].sort().join(':')

function toUser(u: { id: string; username: string; role: string } | null | undefined): UserLite | null {
  return u ? { id: u.id, username: u.username, role: u.role } : null
}

async function tenantStaff(tenantId: string): Promise<UserLite[]> {
  const rows = await db.select({ id: users.id, username: users.username, role: users.role }).from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.status, 'active'), inArray(users.role, [...CHAT_ROLES])))
    .orderBy(users.username)
  return rows
}

/** Kullanıcının görebildiği sohbet mi? Public kanal / işlem sohbeti herkese açık, diğerleri üyelik ister. */
async function assertAccess(actor: Actor, conversationId: string) {
  const conv = await db.query.chatConversations.findFirst({
    where: and(eq(chatConversations.id, conversationId), eq(chatConversations.tenantId, actor.tenantId)),
  })
  if (!conv) throw new AppError('NOT_FOUND', 'Sohbet bulunamadı.', 404)
  const isPublic = conv.type === 'transaction' || (conv.type === 'channel' && !conv.isPrivate)
  if (!isPublic) {
    const m = await db.query.chatMembers.findFirst({
      where: and(eq(chatMembers.conversationId, conversationId), eq(chatMembers.userId, actor.userId)),
    })
    if (!m) throw new AppError('FORBIDDEN', 'Bu sohbete erişiminiz yok.', 403)
  }
  return conv
}

/** Public sohbette ilk etkileşimde üyelik kaydı aç (okundu takibi için). */
async function ensureMember(conversationId: string, userId: string) {
  await db.insert(chatMembers).values({ conversationId, userId })
    .onConflictDoNothing({ target: [chatMembers.conversationId, chatMembers.userId] })
}

/** Sohbetin SSE alıcıları: private/direct → üyeler; public → tüm tenant. */
async function emitToConversation(tenantId: string, conv: { id: string; type: string; isPrivate: boolean }, event: string, data: Record<string, unknown>) {
  const payload = { type: event, conversationId: conv.id, ...data }
  const isPublic = conv.type === 'transaction' || (conv.type === 'channel' && !conv.isPrivate)
  if (isPublic) { sseManager.emitToTenant(tenantId, event, payload); return }
  const members = await db.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.conversationId, conv.id))
  for (const m of members) sseManager.emitToUser(tenantId, m.userId, payload)
}

async function ensureGeneralChannel(actor: Actor) {
  const existing = await db.query.chatConversations.findFirst({
    where: and(eq(chatConversations.tenantId, actor.tenantId), eq(chatConversations.type, 'channel'), sql`lower(${chatConversations.name}) = 'genel'`),
    columns: { id: true },
  })
  if (existing) return
  await db.insert(chatConversations).values({
    tenantId: actor.tenantId, type: 'channel', name: 'genel', isPrivate: false, createdBy: actor.userId,
  }).onConflictDoNothing()
}

function serializeMessage(m: {
  id: string; conversationId: string; content: string; attachments: ChatAttachmentMeta[]; isSystem: boolean
  editedAt: Date | null; deletedAt: Date | null; createdAt: Date
  sender?: { id: string; username: string; role: string } | null
  replyTo?: { id: string; content: string; deletedAt: Date | null; sender?: { id: string; username: string; role: string } | null } | null
}) {
  return {
    id:             m.id,
    conversationId: m.conversationId,
    sender:         toUser(m.sender),
    content:        m.deletedAt ? '' : m.content,
    attachments:    m.deletedAt ? [] : (m.attachments ?? []),
    replyTo:        m.replyTo ? { id: m.replyTo.id, content: m.replyTo.deletedAt ? '' : m.replyTo.content, sender: toUser(m.replyTo.sender) } : null,
    isSystem:       m.isSystem,
    editedAt:       m.editedAt?.toISOString() ?? null,
    deletedAt:      m.deletedAt?.toISOString() ?? null,
    createdAt:      m.createdAt.toISOString(),
  }
}

export const chatService = {

  listUsers: (actor: Actor) => tenantStaff(actor.tenantId),

  async listConversations(actor: Actor) {
    await ensureGeneralChannel(actor)

    // Görünür sohbetler: public kanallar + işlem sohbetleri + üyesi olduğum private/direct
    const convs = await db.query.chatConversations.findMany({
      where: and(
        eq(chatConversations.tenantId, actor.tenantId),
        or(
          eq(chatConversations.type, 'transaction'),
          and(eq(chatConversations.type, 'channel'), eq(chatConversations.isPrivate, false)),
          sql`EXISTS (SELECT 1 FROM chat_members cm WHERE cm.conversation_id = ${chatConversations.id} AND cm.user_id = ${actor.userId}::uuid)`,
        ),
      ),
      with: {
        members: { with: { user: { columns: { id: true, username: true, role: true } } } },
        transaction: { columns: { id: true, externalUserId: true, type: true, amount: true, currency: true } },
      },
      orderBy: [desc(sql`coalesce(${chatConversations.lastMessageAt}, ${chatConversations.createdAt})`)],
    })
    if (convs.length === 0) return []

    const ids = convs.map((c) => c.id)

    // Son mesaj + okunmamış sayısı (tek sorgu her biri)
    const lastRows = await db.execute(sql`
      SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.content, m.deleted_at, m.created_at, u.username
      FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id IN ${sql`(${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`}
      ORDER BY m.conversation_id, m.created_at DESC
    `) as unknown as { conversation_id: string; content: string; deleted_at: Date | null; created_at: Date; username: string | null }[]
    const lastMap = new Map(lastRows.map((r) => [r.conversation_id, r]))

    const unreadRows = await db.execute(sql`
      SELECT m.conversation_id, count(*)::int AS cnt
      FROM chat_messages m
      LEFT JOIN chat_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${actor.userId}::uuid
      WHERE m.conversation_id IN ${sql`(${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`}
        AND m.deleted_at IS NULL
        AND (m.sender_id IS NULL OR m.sender_id <> ${actor.userId}::uuid)
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
      GROUP BY m.conversation_id
    `) as unknown as { conversation_id: string; cnt: number }[]
    const unreadMap = new Map(unreadRows.map((r) => [r.conversation_id, r.cnt]))

    return convs.map((c) => {
      const members = c.members.map((m) => toUser(m.user)!).filter(Boolean)
      const isMember = c.members.some((m) => m.userId === actor.userId)
      let name = c.name ?? ''
      if (c.type === 'direct') {
        const other = members.find((m) => m.id !== actor.userId)
        name = other?.username ?? 'Silinmiş kullanıcı'
      } else if (c.type === 'transaction') {
        const t = c.transaction
        name = t ? `${t.type === 'withdrawal' ? 'Çekim' : 'Yatırım'} · ${t.externalUserId} · ${t.amount} ${t.currency}` : `İşlem ${c.transactionId?.slice(0, 8)}`
      }
      const last = lastMap.get(c.id)
      return {
        id: c.id, type: c.type, name, isPrivate: c.isPrivate, transactionId: c.transactionId,
        members, isMember,
        unreadCount:   unreadMap.get(c.id) ?? 0,
        lastMessage:   last ? { content: last.deleted_at ? '(silindi)' : last.content, sender: last.username, createdAt: new Date(last.created_at).toISOString() } : null,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        createdAt:     c.createdAt.toISOString(),
      }
    })
  },

  async getConversation(actor: Actor, id: string) {
    await assertAccess(actor, id)
    const list = await this.listConversations(actor)
    const found = list.find((c) => c.id === id)
    if (!found) throw new AppError('NOT_FOUND', 'Sohbet bulunamadı.', 404)
    return found
  },

  async createConversation(actor: Actor, input: CreateChatConversationInput) {
    if (input.type === 'channel') {
      const staff = await tenantStaff(actor.tenantId)
      const staffIds = new Set(staff.map((s) => s.id))
      const memberIds = [...new Set([actor.userId, ...input.memberIds.filter((id) => staffIds.has(id))])]
      const conv = await db.transaction(async (tx) => {
        const [c] = await tx.insert(chatConversations).values({
          tenantId: actor.tenantId, type: 'channel', name: input.name.trim(), isPrivate: input.isPrivate, createdBy: actor.userId,
        }).returning().catch((e: { code?: string }) => {
          if (e.code === '23505') throw new AppError('CONFLICT', 'Bu isimde bir kanal zaten var.', 409)
          throw e
        })
        await tx.insert(chatMembers).values(memberIds.map((userId) => ({ conversationId: c.id, userId })))
        await tx.insert(chatMessages).values({ conversationId: c.id, senderId: null, isSystem: true, content: `#${c.name} kanalı ${actor.username} tarafından oluşturuldu.` })
        return c
      })
      const result = await this.getConversation(actor, conv.id)
      await emitToConversation(actor.tenantId, conv, 'chat.conversation', { conversation: result })
      return result
    }

    if (input.type === 'direct') {
      if (input.userId === actor.userId) throw new AppError('VALIDATION_ERROR', 'Kendinizle sohbet başlatamazsınız.', 400)
      const other = await db.query.users.findFirst({
        where: and(eq(users.id, input.userId), eq(users.tenantId, actor.tenantId), inArray(users.role, [...CHAT_ROLES])),
        columns: { id: true },
      })
      if (!other) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.', 404)
      const key = directKeyFor(actor.userId, input.userId)
      const existing = await db.query.chatConversations.findFirst({
        where: and(eq(chatConversations.tenantId, actor.tenantId), eq(chatConversations.directKey, key)), columns: { id: true },
      })
      if (existing) return this.getConversation(actor, existing.id)
      const conv = await db.transaction(async (tx) => {
        const [c] = await tx.insert(chatConversations).values({ tenantId: actor.tenantId, type: 'direct', directKey: key, isPrivate: true, createdBy: actor.userId }).returning()
        await tx.insert(chatMembers).values([{ conversationId: c.id, userId: actor.userId }, { conversationId: c.id, userId: input.userId }])
        return c
      })
      const result = await this.getConversation(actor, conv.id)
      sseManager.emitToUser(actor.tenantId, input.userId, { type: 'chat.conversation', conversationId: conv.id })
      return result
    }

    // transaction
    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, input.transactionId), eq(transactions.tenantId, actor.tenantId)), columns: { id: true },
    })
    if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
    const existing = await db.query.chatConversations.findFirst({ where: eq(chatConversations.transactionId, tx.id), columns: { id: true } })
    if (existing) { await ensureMember(existing.id, actor.userId); return this.getConversation(actor, existing.id) }
    const [c] = await db.insert(chatConversations).values({
      tenantId: actor.tenantId, type: 'transaction', transactionId: tx.id, isPrivate: false, createdBy: actor.userId,
    }).onConflictDoNothing().returning()
    const convId = c?.id ?? (await db.query.chatConversations.findFirst({ where: eq(chatConversations.transactionId, tx.id), columns: { id: true } }))!.id
    await ensureMember(convId, actor.userId)
    return this.getConversation(actor, convId)
  },

  async listMessages(actor: Actor, conversationId: string, opts: { before?: string; limit: number }) {
    await assertAccess(actor, conversationId)
    const conds = [eq(chatMessages.conversationId, conversationId)]
    if (opts.before) conds.push(lt(chatMessages.createdAt, new Date(opts.before)))
    const rows = await db.query.chatMessages.findMany({
      where: and(...conds),
      orderBy: [desc(chatMessages.createdAt)],
      limit: opts.limit + 1,
      with: {
        sender:  { columns: { id: true, username: true, role: true } },
        replyTo: { columns: { id: true, content: true, deletedAt: true }, with: { sender: { columns: { id: true, username: true, role: true } } } },
      },
    })
    const hasMore = rows.length > opts.limit
    const page = rows.slice(0, opts.limit).reverse()
    return { data: page.map(serializeMessage), hasMore }
  },

  async sendMessage(actor: Actor, conversationId: string, input: SendChatMessageInput) {
    const conv = await assertAccess(actor, conversationId)
    await ensureMember(conversationId, actor.userId)

    // Ekleri doğrula ve bu mesaja bağla
    let attachments: ChatAttachmentMeta[] = []
    if (input.attachmentIds.length > 0) {
      const rows = await db.select({ id: chatAttachments.id, name: chatAttachments.name, mime: chatAttachments.mime, size: chatAttachments.size })
        .from(chatAttachments)
        .where(and(inArray(chatAttachments.id, input.attachmentIds), eq(chatAttachments.tenantId, actor.tenantId), eq(chatAttachments.uploaderId, actor.userId), isNull(chatAttachments.messageId)))
      if (rows.length !== input.attachmentIds.length) throw new AppError('VALIDATION_ERROR', 'Bir veya daha fazla ek geçersiz.', 400)
      attachments = rows
    }
    if (input.replyToId) {
      const r = await db.query.chatMessages.findFirst({ where: and(eq(chatMessages.id, input.replyToId), eq(chatMessages.conversationId, conversationId)), columns: { id: true } })
      if (!r) throw new AppError('NOT_FOUND', 'Yanıtlanan mesaj bulunamadı.', 404)
    }

    const msg = await db.transaction(async (tx) => {
      const now = new Date()
      const [m] = await tx.insert(chatMessages).values({
        conversationId, senderId: actor.userId, content: input.content.trim(), attachments, replyToId: input.replyToId ?? null, createdAt: now,
      }).returning()
      if (attachments.length) await tx.update(chatAttachments).set({ messageId: m.id }).where(inArray(chatAttachments.id, attachments.map((a) => a.id)))
      await tx.update(chatConversations).set({ lastMessageAt: now, updatedAt: now }).where(eq(chatConversations.id, conversationId))
      await tx.update(chatMembers).set({ lastReadAt: now }).where(and(eq(chatMembers.conversationId, conversationId), eq(chatMembers.userId, actor.userId)))
      return m
    })

    const full = await db.query.chatMessages.findFirst({
      where: eq(chatMessages.id, msg.id),
      with: {
        sender:  { columns: { id: true, username: true, role: true } },
        replyTo: { columns: { id: true, content: true, deletedAt: true }, with: { sender: { columns: { id: true, username: true, role: true } } } },
      },
    })
    const serialized = serializeMessage(full!)
    await emitToConversation(actor.tenantId, conv, 'chat.message', { message: serialized })

    // @mention → bildirim
    const mentioned = [...new Set([...input.content.matchAll(/@([a-z0-9_-]{3,64})/gi)].map((m) => m[1].toLowerCase()))]
    if (mentioned.length > 0) {
      const staff = await tenantStaff(actor.tenantId)
      const targets = staff.filter((u) => mentioned.includes(u.username.toLowerCase()) && u.id !== actor.userId)
      if (targets.length > 0) {
        const payload = { type: 'chat.mention', conversationId, messageId: msg.id, from: actor.username, preview: input.content.slice(0, 120) }
        await db.insert(notifications).values(targets.map((t) => ({ tenantId: actor.tenantId, userId: t.id, transactionId: conv.transactionId ?? null, type: 'chat.mention', payload, isRead: false })))
        for (const t of targets) sseManager.emitToUser(actor.tenantId, t.id, payload)
      }
    }
    return serialized
  },

  async editMessage(actor: Actor, messageId: string, content: string) {
    const m = await db.query.chatMessages.findFirst({ where: eq(chatMessages.id, messageId), with: { conversation: true } })
    if (!m || m.conversation.tenantId !== actor.tenantId) throw new AppError('NOT_FOUND', 'Mesaj bulunamadı.', 404)
    if (m.senderId !== actor.userId) throw new AppError('FORBIDDEN', 'Yalnızca kendi mesajınızı düzenleyebilirsiniz.', 403)
    if (m.deletedAt) throw new AppError('INVALID_STATE_TRANSITION', 'Silinmiş mesaj düzenlenemez.', 409)
    await db.update(chatMessages).set({ content: content.trim(), editedAt: new Date() }).where(eq(chatMessages.id, messageId))
    const full = await db.query.chatMessages.findFirst({
      where: eq(chatMessages.id, messageId),
      with: { sender: { columns: { id: true, username: true, role: true } }, replyTo: { columns: { id: true, content: true, deletedAt: true }, with: { sender: { columns: { id: true, username: true, role: true } } } } },
    })
    const serialized = serializeMessage(full!)
    await emitToConversation(actor.tenantId, m.conversation, 'chat.message.updated', { message: serialized })
    return serialized
  },

  async deleteMessage(actor: Actor, messageId: string) {
    const m = await db.query.chatMessages.findFirst({ where: eq(chatMessages.id, messageId), with: { conversation: true } })
    if (!m || m.conversation.tenantId !== actor.tenantId) throw new AppError('NOT_FOUND', 'Mesaj bulunamadı.', 404)
    const isAdmin = actor.role === 'tenant_admin' || actor.role === 'finans_admin'
    if (m.senderId !== actor.userId && !isAdmin) throw new AppError('FORBIDDEN', 'Bu mesajı silme yetkiniz yok.', 403)
    await db.update(chatMessages).set({ deletedAt: new Date() }).where(eq(chatMessages.id, messageId))
    await emitToConversation(actor.tenantId, m.conversation, 'chat.message.deleted', { messageId })
  },

  async markRead(actor: Actor, conversationId: string) {
    await assertAccess(actor, conversationId)
    const now = new Date()
    await db.insert(chatMembers).values({ conversationId, userId: actor.userId, lastReadAt: now })
      .onConflictDoUpdate({ target: [chatMembers.conversationId, chatMembers.userId], set: { lastReadAt: now } })
  },

  async unreadTotal(actor: Actor) {
    const rows = await db.execute(sql`
      SELECT count(*)::int AS cnt
      FROM chat_messages m
      JOIN chat_conversations c ON c.id = m.conversation_id
      LEFT JOIN chat_members cm ON cm.conversation_id = c.id AND cm.user_id = ${actor.userId}::uuid
      WHERE c.tenant_id = ${actor.tenantId}::uuid
        AND m.deleted_at IS NULL
        AND (m.sender_id IS NULL OR m.sender_id <> ${actor.userId}::uuid)
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
        AND (
          c.type = 'transaction'
          OR (c.type = 'channel' AND c.is_private = false)
          OR cm.user_id IS NOT NULL
        )
        AND (cm.muted IS NULL OR cm.muted = false)
    `) as unknown as { cnt: number }[]
    return rows[0]?.cnt ?? 0
  },

  async addMembers(actor: Actor, conversationId: string, userIds: string[]) {
    const conv = await assertAccess(actor, conversationId)
    if (conv.type === 'direct') throw new AppError('INVALID_STATE_TRANSITION', 'Kişiye özel sohbete üye eklenemez.', 409)
    const staff = await tenantStaff(actor.tenantId)
    const staffMap = new Map(staff.map((s) => [s.id, s]))
    const valid = userIds.filter((id) => staffMap.has(id))
    if (valid.length === 0) throw new AppError('VALIDATION_ERROR', 'Geçerli kullanıcı yok.', 400)
    await db.insert(chatMembers).values(valid.map((userId) => ({ conversationId, userId }))).onConflictDoNothing()
    await db.insert(chatMessages).values({ conversationId, senderId: null, isSystem: true, content: `${actor.username}, ${valid.map((id) => '@' + staffMap.get(id)!.username).join(', ')} kullanıcılarını ekledi.` })
    await db.update(chatConversations).set({ lastMessageAt: new Date() }).where(eq(chatConversations.id, conversationId))
    for (const id of valid) sseManager.emitToUser(actor.tenantId, id, { type: 'chat.conversation', conversationId })
    await emitToConversation(actor.tenantId, conv, 'chat.conversation', { conversationId })
    return this.getConversation(actor, conversationId)
  },

  async removeMember(actor: Actor, conversationId: string, userId: string) {
    const conv = await assertAccess(actor, conversationId)
    if (conv.type === 'direct') throw new AppError('INVALID_STATE_TRANSITION', 'Kişiye özel sohbetten çıkılamaz.', 409)
    const isAdmin = actor.role === 'tenant_admin' || actor.role === 'finans_admin' || conv.createdBy === actor.userId
    if (userId !== actor.userId && !isAdmin) throw new AppError('FORBIDDEN', 'Üye çıkarma yetkiniz yok.', 403)
    await db.delete(chatMembers).where(and(eq(chatMembers.conversationId, conversationId), eq(chatMembers.userId, userId)))
    const u = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { username: true } })
    await db.insert(chatMessages).values({ conversationId, senderId: null, isSystem: true, content: userId === actor.userId ? `${actor.username} kanaldan ayrıldı.` : `${actor.username}, @${u?.username ?? '?'} kullanıcısını çıkardı.` })
    await emitToConversation(actor.tenantId, conv, 'chat.conversation', { conversationId })
    sseManager.emitToUser(actor.tenantId, userId, { type: 'chat.conversation', conversationId })
  },

  async typing(actor: Actor, conversationId: string) {
    const conv = await assertAccess(actor, conversationId)
    await emitToConversation(actor.tenantId, conv, 'chat.typing', { userId: actor.userId, username: actor.username })
  },

  async uploadAttachment(actor: Actor, input: { name: string; mime: string; dataBase64: string }) {
    if (!ALLOWED_MIME.test(input.mime)) throw new AppError('VALIDATION_ERROR', 'Bu dosya türüne izin verilmiyor.', 400)
    const buf = Buffer.from(input.dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64')
    if (buf.length === 0) throw new AppError('VALIDATION_ERROR', 'Dosya boş.', 400)
    if (buf.length > MAX_ATTACHMENT_BYTES) throw new AppError('VALIDATION_ERROR', 'Dosya 10 MB sınırını aşıyor.', 400)
    const [row] = await db.insert(chatAttachments).values({
      tenantId: actor.tenantId, uploaderId: actor.userId, name: input.name.replace(/[\r\n"]/g, '_'), mime: input.mime, size: buf.length, data: buf,
    }).returning({ id: chatAttachments.id, name: chatAttachments.name, mime: chatAttachments.mime, size: chatAttachments.size })
    return row
  },

  async getAttachment(actor: Actor, id: string) {
    const row = await db.query.chatAttachments.findFirst({ where: and(eq(chatAttachments.id, id), eq(chatAttachments.tenantId, actor.tenantId)) })
    if (!row) throw new AppError('NOT_FOUND', 'Ek bulunamadı.', 404)
    if (row.messageId) {
      const m = await db.query.chatMessages.findFirst({ where: eq(chatMessages.id, row.messageId), columns: { conversationId: true, deletedAt: true } })
      if (!m || m.deletedAt) throw new AppError('NOT_FOUND', 'Ek bulunamadı.', 404)
      await assertAccess(actor, m.conversationId)
    } else if (row.uploaderId !== actor.userId) {
      throw new AppError('FORBIDDEN', 'Bu eke erişiminiz yok.', 403)
    }
    return row
  },
}
