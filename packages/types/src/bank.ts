import { z } from 'zod'

export const BankSchema = z.object({
  id:        z.string().uuid(),
  name:      z.string(),
  ibanCode:  z.string().nullable(),
  isActive:  z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
})

export const CreateBankSchema = z.object({
  name:     z.string().min(2).max(100),
  ibanCode: z.string().length(5).regex(/^\d{5}$/, 'Banka kodu 5 haneli rakam olmalıdır').optional(),
})

export const UpdateBankStatusSchema = z.object({
  isActive: z.boolean(),
})

export const BankListResponseSchema = z.object({ data: z.array(BankSchema) })
export const BankResponseSchema     = z.object({ data: BankSchema })

export type Bank             = z.infer<typeof BankSchema>
export type BankListResponse = z.infer<typeof BankListResponseSchema>
export type CreateBank       = z.infer<typeof CreateBankSchema>
export type UpdateBankStatus = z.infer<typeof UpdateBankStatusSchema>
