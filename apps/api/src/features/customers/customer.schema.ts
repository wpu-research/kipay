import { z } from 'zod'

export const CustomerListQuerySchema = z.object({
  search:     z.string().optional(),
  merchantId: z.string().uuid().optional(),
  tenantId:   z.string().uuid().optional(),
  page:       z.coerce.number().int().min(1).max(1000).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
})

export const CustomerListResponseSchema = z.object({
  data: z.array(z.object({
    id:             z.string().uuid(),
    merchantId:     z.string().uuid(),
    merchantName:   z.string(),
    externalUserId: z.string(),
    identityNumber: z.string().nullable(),
    firstName:      z.string().nullable(),
    lastName:       z.string().nullable(),
    phone:          z.string().nullable(),
    depositCount:   z.number().int(),
    firstSeenAt:    z.string(),
    lastSeenAt:     z.string(),
  })),
  meta: z.object({ total: z.number().int(), page: z.number().int(), limit: z.number().int(), totalPages: z.number().int() }),
})
