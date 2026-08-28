import { z } from 'zod'

// Sayfalı liste yanıt formatı — tüm liste endpointlerinde kullanılacak
export const PaginationMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
})
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>

// Standart hata yanıt formatı
export const AppErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    statusCode: z.number(),
  }),
})
export type AppError = z.infer<typeof AppErrorSchema>

// Sayfalı liste yanıt wrapper'ı
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    meta: PaginationMetaSchema,
  })
