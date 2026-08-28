import { z } from 'zod'

export const CryptoSchema = z.object({
  id:        z.string().uuid(),
  name:      z.string(),
  symbol:    z.string(),
  isActive:  z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
})

export const CreateCryptoSchema = z.object({
  name:   z.string().min(2).max(100),
  symbol: z.string().min(1).max(10).toUpperCase(),
})

export const UpdateCryptoStatusSchema = z.object({
  isActive: z.boolean(),
})

export const CryptoListResponseSchema = z.object({ data: z.array(CryptoSchema) })
export const CryptoResponseSchema     = z.object({ data: CryptoSchema })

export type Crypto             = z.infer<typeof CryptoSchema>
export type CryptoListResponse = z.infer<typeof CryptoListResponseSchema>
export type CreateCrypto       = z.infer<typeof CreateCryptoSchema>
export type UpdateCryptoStatus = z.infer<typeof UpdateCryptoStatusSchema>
