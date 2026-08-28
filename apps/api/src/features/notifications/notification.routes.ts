import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import * as sseManager from '../../sse/sse-manager.js'
import { notificationService } from './notification.service.js'
import {
  NotificationListResponseSchema,
  MarkReadResponseSchema,
  MarkAllReadResponseSchema,
} from './notification.schema.js'

function serializeNotification(n: {
  id: string; type: string; payload: unknown; isRead: boolean; createdAt: Date
}) {
  return {
    id:        n.id,
    type:      n.type,
    payload:   n.payload as Record<string, unknown>,
    isRead:    n.isRead,
    createdAt: n.createdAt.toISOString(),
  }
}

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {

  // SSE endpoint — ÖNCE tanımlanmalı (/:id/read ile çakışmasın)
  app.get('/sse', {
    preHandler: [authenticate],
    config:     { rateLimit: false },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user

    reply.hijack()

    const res = reply.raw

    // Fastify reply'a eklenen header'ları (CORS vb.) ham res'e kopyala
    // reply.hijack() sonrası reply.send() çağrılmadığı için bu header'lar
    // otomatik yazılmıyor; tarayıcı CORS header'larını göremezse SSE bağlantısını reddediyor.
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) res.setHeader(name, value as string | string[] | number)
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n') } catch { clearInterval(heartbeat) }
    }, 30_000)

    sseManager.addConnection(tenantId, userId, res)
    console.log(`[sse] connected userId=${userId} tenantId=${tenantId} total=${sseManager.getConnectionCount(tenantId)}`)

    request.raw.on('close', () => {
      clearInterval(heartbeat)
      sseManager.removeConnection(tenantId, userId, res)
      console.log(`[sse] disconnected userId=${userId} tenantId=${tenantId}`)
    })
  })

  // GET /notifications — sayfalı liste
  app.get('/', {
    preHandler: [authenticate],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Notifications'],
      summary: 'Bildirim listesi',
      querystring: z.object({
        isRead: z.enum(['true', 'false']).optional().transform((v) =>
          v === 'true' ? true : v === 'false' ? false : undefined
        ),
        page:   z.coerce.number().int().min(1).max(1000).default(1),
        limit:  z.coerce.number().int().min(1).max(100).default(20),
      }),
      response: { 200: NotificationListResponseSchema },
    },
  }, async (request) => {
    const { isRead, page, limit } = request.query
    const { data, meta } = await notificationService.listNotifications({
      tenantId: request.user.tenantId,
      userId:   request.user.userId,
      isRead,
      page,
      limit,
    })
    return { data: data.map(serializeNotification), meta }
  })

  // PATCH /notifications/read-all — ÖNCE tanımlanmalı (/:id/read ile çakışmasın)
  app.patch('/read-all', {
    preHandler: [authenticate],
    config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags: ['Notifications'], summary: 'Tümünü okundu işaretle', response: { 200: MarkAllReadResponseSchema } },
  }, async (request) => {
    return notificationService.markAllRead({
      tenantId: request.user.tenantId,
      userId:   request.user.userId,
    })
  })

  // PATCH /notifications/:id/read
  app.patch('/:id/read', {
    preHandler: [authenticate],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Notifications'],
      summary: 'Bildirimi okundu işaretle',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: MarkReadResponseSchema },
    },
  }, async (request) => {
    return notificationService.markRead({
      tenantId: request.user.tenantId,
      userId:   request.user.userId,
      id:       request.params.id,
    })
  })
}
