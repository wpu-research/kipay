import { z } from 'zod'
import { PaginatedResponseSchema } from './common.js'

// P-3: Slug başında/sonunda tire kabul etmeyen gelişmiş regex
// P-5 (CR-6): Tek karakterli alternatif ölü kod — min(2) zaten reddeder; sadeleştirildi
// Geçerli: "ab", "my-casino", "casino-1" | Geçersiz: "-casino", "casino-", "a"
const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

// İstek şemaları
export const CreateTenantSchema = z.object({
  name: z.string().min(2, 'Tenant adı en az 2 karakter').max(128),
  slug: z.string()
    .min(2, 'Slug en az 2 karakter')
    .max(64)
    .regex(slugRegex, 'Slug yalnızca küçük harf/rakam içermeli; tire başta/sonda olamaz'),
})

// P-2: Her iki alan opsiyonel ama en az biri zorunlu — boş body {} Drizzle syntax error üretir
// P-6: superRefine + addIssue → path-tagged Zod hatası, Fastify type provider ile tutarlı serialize
export const UpdateTenantSchema = z.object({
  name: z.string().min(2).max(128).optional(),
  slug: z.string().min(2).max(64).regex(slugRegex, 'Slug yalnızca küçük harf/rakam içermeli; tire başta/sonda olamaz').optional(),
}).superRefine((data, ctx) => {
  if (data.name === undefined && data.slug === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'En az bir alan (name veya slug) gerekli',
      path: ['name'],
    })
  }
})

export const UpdateTenantStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

// Yanıt şemaları
export const TenantSchema = z.object({
  id:        z.string().uuid(),
  name:      z.string(),
  slug:      z.string(),
  status:    z.enum(['active', 'inactive']),
  createdAt: z.string(),  // ISO 8601 string
  updatedAt: z.string(),
})

export const TenantListResponseSchema = PaginatedResponseSchema(TenantSchema)
export const TenantResponseSchema = z.object({ data: TenantSchema })

// Tipler
export type CreateTenantInput  = z.infer<typeof CreateTenantSchema>
export type UpdateTenantInput  = z.infer<typeof UpdateTenantSchema>
export type Tenant             = z.infer<typeof TenantSchema>
export type TenantListResponse = z.infer<typeof TenantListResponseSchema>
