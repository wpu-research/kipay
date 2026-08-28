import { z } from 'zod'

export const NotificationResponseSchema = z.object({
  id:        z.string().uuid(),
  type:      z.string(),
  payload:   z.record(z.unknown()),
  isRead:    z.boolean(),
  createdAt: z.string(),
})

export const NotificationListResponseSchema = z.object({
  data: z.array(NotificationResponseSchema),
  meta: z.object({
    total: z.number(),
    page:  z.number(),
    limit: z.number(),
  }),
})

export const MarkReadResponseSchema = z.object({
  success: z.boolean(),
})

export const MarkAllReadResponseSchema = z.object({
  updated: z.number(),
})
