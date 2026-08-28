import { z } from 'zod'
import { PaginatedResponseSchema } from './common.js'

// Sağlayıcı şemaları
export const CreatePaymentProviderSchema = z.object({
  name: z.string().min(2).max(128),
})

export const UpdatePaymentProviderSchema = z.object({
  name:   z.string().min(2).max(128).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine(data => data.name !== undefined || data.status !== undefined, {
  message: 'En az bir alan (name veya status) güncellenmeli.',
})

export const PaymentProviderSchema = z.object({
  id:        z.string().uuid(),
  tenantId:  z.string().uuid(),
  name:      z.string(),
  status:    z.enum(['active', 'inactive']),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export const PaymentProviderListResponseSchema = PaginatedResponseSchema(PaymentProviderSchema)
export const PaymentProviderResponseSchema = z.object({ data: PaymentProviderSchema })

// Kategori şemaları
export const CreatePaymentProviderCategorySchema = z.object({
  name: z.string().min(2).max(128),
})

export const UpdatePaymentProviderCategorySchema = z.object({
  name: z.string().min(2).max(128),
})

export const PaymentProviderCategorySchema = z.object({
  id:        z.string().uuid(),
  tenantId:  z.string().uuid(),
  name:      z.string(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export const PaymentProviderCategoryListResponseSchema = PaginatedResponseSchema(PaymentProviderCategorySchema)
export const PaymentProviderCategoryResponseSchema = z.object({ data: PaymentProviderCategorySchema })

// Tipler
export type CreatePaymentProviderInput            = z.infer<typeof CreatePaymentProviderSchema>
export type UpdatePaymentProviderInput            = z.infer<typeof UpdatePaymentProviderSchema>
export type PaymentProvider                       = z.infer<typeof PaymentProviderSchema>
export type PaymentProviderListResponse           = z.infer<typeof PaymentProviderListResponseSchema>
export type CreatePaymentProviderCategoryInput    = z.infer<typeof CreatePaymentProviderCategorySchema>
export type UpdatePaymentProviderCategoryInput    = z.infer<typeof UpdatePaymentProviderCategorySchema>
export type PaymentProviderCategory               = z.infer<typeof PaymentProviderCategorySchema>
export type PaymentProviderCategoryListResponse   = z.infer<typeof PaymentProviderCategoryListResponseSchema>
