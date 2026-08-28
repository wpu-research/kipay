import { z } from 'zod'

export const HealthResponseSchema = z.object({
  status:    z.enum(['ok', 'degraded']),
  db:        z.enum(['ok', 'error']),
  pgBoss:    z.enum(['ok', 'error']),
  timestamp: z.string(),
})

export const QueueJobStatsSchema = z.object({
  name:      z.string(),
  completed: z.number().int(),
  failed:    z.number().int(),
  active:    z.number().int(),
  waiting:   z.number().int(),
})

export const QueueStatsResponseSchema = z.object({
  queues:              z.array(QueueJobStatsSchema),
  callbackFailedCount: z.number().int(),
  callbackSummary: z.object({
    pending: z.number().int(),
    sent:    z.number().int(),
    failed:  z.number().int(),
    dead:    z.number().int(),
  }),
})

export type HealthResponse = z.infer<typeof HealthResponseSchema>
export type QueueJobStats = z.infer<typeof QueueJobStatsSchema>
export type QueueStatsResponse = z.infer<typeof QueueStatsResponseSchema>
