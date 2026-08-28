import { z } from 'zod'

export const SsePendingPayloadSchema = z.object({
  type:         z.literal('transaction.pending'),
  txId:         z.string().uuid(),
  amount:       z.string(),
  currency:     z.string(),
  merchantName: z.string(),
  createdAt:    z.string(), // ISO 8601
})

export const NotificationSchema = z.object({
  id:        z.string().uuid(),
  type:      z.string(),
  payload:   SsePendingPayloadSchema,
  isRead:    z.boolean(),
  createdAt: z.string(),
})

export const NotificationListSchema = z.object({
  data: z.array(NotificationSchema),
  meta: z.object({ total: z.number(), page: z.number(), limit: z.number() }),
})

export type SsePendingPayload = z.infer<typeof SsePendingPayloadSchema>
export type NotificationType  = z.infer<typeof NotificationSchema>
