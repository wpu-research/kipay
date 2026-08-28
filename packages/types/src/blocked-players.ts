import { z } from 'zod'

export const BlockPlayerSchema = z.object({
  externalUserId: z.string().min(1),
  merchantId:     z.string().uuid(),
  blockedUntil:   z.string().datetime().optional(),
  permanent:      z.boolean().optional(),
})
export type BlockPlayerInput = z.infer<typeof BlockPlayerSchema>

export const BlockedPlayerItemSchema = z.object({
  id:             z.string().uuid(),
  merchantId:     z.string().uuid(),
  externalUserId: z.string(),
  blockedUntil:   z.string().nullable(),
  isPermanent:    z.boolean(),
  createdBy:      z.string().uuid(),
  createdAt:      z.string(),
})
export type BlockedPlayerItem = z.infer<typeof BlockedPlayerItemSchema>

export const BlockedPlayerListResponseSchema = z.object({
  data:  z.array(BlockedPlayerItemSchema),
  total: z.number(),
  page:  z.number(),
  limit: z.number(),
})
export type BlockedPlayerListResponse = z.infer<typeof BlockedPlayerListResponseSchema>
