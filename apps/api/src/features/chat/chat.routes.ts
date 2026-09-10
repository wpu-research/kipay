import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  ChatConversationListResponseSchema, ChatConversationResponseSchema, ChatMessageListResponseSchema, ChatMessageResponseSchema,
  ChatUserListResponseSchema, ChatUnreadResponseSchema, CreateChatConversationSchema, SendChatMessageSchema, EditChatMessageSchema,
  UploadChatAttachmentSchema, UploadChatAttachmentResponseSchema, AddChatMembersSchema,
} from '@panel/types'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'
import { chatService, CHAT_ROLES } from './chat.service.js'

async function requireChatRole(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!(CHAT_ROLES as readonly string[]).includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Sohbet yalnızca tenant finans ekibi için kullanılabilir.', 403)
  }
}

const actorOf = (r: FastifyRequest) => ({ userId: r.user.userId, tenantId: r.user.tenantId, role: r.user.role, username: r.user.username })
const idParam = z.object({ id: z.string().uuid() })

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  const pre = [authenticate, requireChatRole]

  app.get('/users', { preHandler: pre, schema: { tags: ['Chat'], summary: 'Sohbet kullanıcıları', response: { 200: ChatUserListResponseSchema } } },
    async (req) => ({ data: await chatService.listUsers(actorOf(req)) }))

  app.get('/unread-count', { preHandler: pre, schema: { tags: ['Chat'], summary: 'Toplam okunmamış', response: { 200: ChatUnreadResponseSchema } } },
    async (req) => ({ total: await chatService.unreadTotal(actorOf(req)) }))

  app.get('/conversations', { preHandler: pre, schema: { tags: ['Chat'], summary: 'Sohbet listesi', response: { 200: ChatConversationListResponseSchema } } },
    async (req) => ({ data: await chatService.listConversations(actorOf(req)) }))

  app.post('/conversations', {
    preHandler: pre, config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags: ['Chat'], summary: 'Sohbet oluştur / getir', body: CreateChatConversationSchema, response: { 201: ChatConversationResponseSchema } },
  }, async (req, reply) => {
    const data = await chatService.createConversation(actorOf(req), req.body)
    req.auditEntry = { action: 'chat.conversation.create', resourceType: 'chat_conversation', resourceId: data.id, tenantId: req.user.tenantId, changes: { type: req.body.type } }
    return reply.status(201).send({ data })
  })

  app.get('/conversations/:id', { preHandler: pre, schema: { tags: ['Chat'], params: idParam, response: { 200: ChatConversationResponseSchema } } },
    async (req) => ({ data: await chatService.getConversation(actorOf(req), req.params.id) }))

  app.get('/conversations/:id/messages', {
    preHandler: pre,
    schema: {
      tags: ['Chat'], summary: 'Mesajlar (geriye doğru sayfalı)', params: idParam,
      querystring: z.object({ before: z.string().datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }),
      response: { 200: ChatMessageListResponseSchema },
    },
  }, async (req) => chatService.listMessages(actorOf(req), req.params.id, req.query))

  app.post('/conversations/:id/messages', {
    preHandler: pre, config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: { tags: ['Chat'], summary: 'Mesaj gönder', params: idParam, body: SendChatMessageSchema, response: { 201: ChatMessageResponseSchema } },
  }, async (req, reply) => reply.status(201).send({ data: await chatService.sendMessage(actorOf(req), req.params.id, req.body) }))

  app.post('/conversations/:id/read', { preHandler: pre, config: { rateLimit: { max: 240, timeWindow: '1 minute' } }, schema: { tags: ['Chat'], params: idParam } },
    async (req, reply) => { await chatService.markRead(actorOf(req), req.params.id); return reply.status(204).send() })

  app.post('/conversations/:id/typing', { preHandler: pre, config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { tags: ['Chat'], params: idParam } },
    async (req, reply) => { await chatService.typing(actorOf(req), req.params.id); return reply.status(204).send() })

  app.post('/conversations/:id/members', {
    preHandler: pre, schema: { tags: ['Chat'], summary: 'Üye ekle', params: idParam, body: AddChatMembersSchema, response: { 200: ChatConversationResponseSchema } },
  }, async (req) => ({ data: await chatService.addMembers(actorOf(req), req.params.id, req.body.userIds) }))

  app.delete('/conversations/:id/members/:userId', {
    preHandler: pre, schema: { tags: ['Chat'], summary: 'Üye çıkar / ayrıl', params: z.object({ id: z.string().uuid(), userId: z.string().uuid() }) },
  }, async (req, reply) => { await chatService.removeMember(actorOf(req), req.params.id, req.params.userId); return reply.status(204).send() })

  app.patch('/messages/:id', {
    preHandler: pre, schema: { tags: ['Chat'], summary: 'Mesaj düzenle', params: idParam, body: EditChatMessageSchema, response: { 200: ChatMessageResponseSchema } },
  }, async (req) => ({ data: await chatService.editMessage(actorOf(req), req.params.id, req.body.content) }))

  app.delete('/messages/:id', { preHandler: pre, schema: { tags: ['Chat'], summary: 'Mesaj sil', params: idParam } },
    async (req, reply) => { await chatService.deleteMessage(actorOf(req), req.params.id); return reply.status(204).send() })

  app.post('/attachments', {
    preHandler: pre,
    bodyLimit: 15 * 1024 * 1024,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags: ['Chat'], summary: 'Ek yükle (base64)', body: UploadChatAttachmentSchema, response: { 201: UploadChatAttachmentResponseSchema } },
  }, async (req, reply) => reply.status(201).send({ data: await chatService.uploadAttachment(actorOf(req), req.body) }))

  app.get('/attachments/:id', { preHandler: pre, schema: { tags: ['Chat'], summary: 'Ek indir', params: idParam, querystring: z.object({ download: z.enum(['1']).optional() }) } },
    async (req, reply) => {
      const a = await chatService.getAttachment(actorOf(req), req.params.id)
      reply.header('Content-Type', a.mime)
      reply.header('Content-Length', String(a.size))
      reply.header('Cache-Control', 'private, max-age=3600')
      reply.header('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(a.name)}`)
      return reply.send(a.data)
    })
}
