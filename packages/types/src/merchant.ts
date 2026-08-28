import { z } from 'zod'
import { PaginatedResponseSchema } from './common.js'

// İstek şemaları
export const CreateMerchantSchema = z.object({
  merchantName: z.string().min(2).max(128),
  webhookUrl:   z.string().url('Geçerli bir URL giriniz'),
  isSandbox:    z.boolean().default(true),
  tenantId:     z.string().uuid().optional(), // sadece super_admin gönderir
})

export const UpdateMerchantStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

// Yanıt şemaları
export const MerchantSchema = z.object({
  id:             z.string().uuid(),
  tenantId:       z.string().uuid(),
  tenantName:     z.string().optional(),
  merchantName:   z.string(),
  webhookUrl:     z.string(),
  isSandbox:      z.boolean(),
  status:         z.enum(['active', 'inactive']),
  callbackSecret: z.string().nullish(),
  createdAt:      z.string(),
  updatedAt:      z.string(),
})

export const MerchantListResponseSchema = PaginatedResponseSchema(MerchantSchema)
export const MerchantResponseSchema = z.object({ data: MerchantSchema })

// Tipler
export type CreateMerchantInput  = z.infer<typeof CreateMerchantSchema>
export type Merchant             = z.infer<typeof MerchantSchema>
export type MerchantListResponse = z.infer<typeof MerchantListResponseSchema>
