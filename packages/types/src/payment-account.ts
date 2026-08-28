import { z } from 'zod'
import { PaginatedResponseSchema } from './common.js'
import { BankSchema } from './bank.js'
import { CryptoSchema } from './crypto.js'

const amountRegex = /^\d+(\.\d{1,2})?$/

// Input şemaları
export const CreatePaymentAccountSchema = z.discriminatedUnion('type', [
  z.object({
    type:          z.literal('bank'),
    bankId:        z.string().uuid(),
    name:          z.string().min(2).max(128),
    accountNumber: z.string().min(4).max(256),
    environment:   z.enum(['sandbox', 'production']),
    dailyLimit:    z.string().regex(amountRegex, 'Geçerli tutar formatı: "500.00"'),
  }),
  z.object({
    type:          z.literal('crypto'),
    cryptoIds:     z.array(z.string().uuid()).min(1, 'En az bir kripto seçilmeli.'),
    name:          z.string().min(2).max(128),
    accountNumber: z.string().min(4).max(256),
    environment:   z.enum(['sandbox', 'production']),
    dailyLimit:    z.string().regex(amountRegex, 'Geçerli tutar formatı: "500.00"'),
  }),
])

export const UpdatePaymentAccountSchema = z.object({
  name:          z.string().min(2).max(128).optional(),
  accountNumber: z.string().min(4).max(256).optional(),
  bankId:        z.string().uuid().optional(),
  cryptoIds:     z.array(z.string().uuid()).min(1).optional(),
  environment:   z.enum(['sandbox', 'production']).optional(),
  dailyLimit:    z.string().regex(amountRegex, 'Geçerli tutar formatı: "500.00"').optional(),
}).strict().refine(
  (d) => Object.values(d).some((v) => v !== undefined),
  { message: 'En az bir alan güncellenmeli.' },
)

export const UpdatePaymentAccountStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

export const UpdateDailyLimitSchema = z.object({
  dailyLimit: z.string().regex(amountRegex, 'Geçerli tutar formatı: "500.00"'),
})

// Response şemaları
export const PaymentAccountSchema = z.object({
  id:            z.string().uuid(),
  tenantId:      z.string().uuid(),
  type:          z.enum(['bank', 'crypto']),
  bankId:        z.string().uuid().nullable(),
  bank:          BankSchema.nullable(),
  cryptos:       z.array(CryptoSchema),
  name:          z.string(),
  accountNumber: z.string(),
  environment:   z.enum(['sandbox', 'production']),
  status:        z.enum(['active', 'inactive']),
  dailyLimit:      z.string(),
  dailyUsed:       z.string(),
  lastResetAt:     z.string().datetime({ offset: true }).nullable(),
  ownedByUserId:   z.string().uuid().nullable(),
  createdAt:       z.string().datetime({ offset: true }),
  updatedAt:       z.string().datetime({ offset: true }),
})

export const PaymentAccountListResponseSchema = PaginatedResponseSchema(PaymentAccountSchema)
export const PaymentAccountResponseSchema     = z.object({ data: PaymentAccountSchema })

// Tipler
export type CreatePaymentAccountInput        = z.infer<typeof CreatePaymentAccountSchema>
export type UpdatePaymentAccountInput        = z.infer<typeof UpdatePaymentAccountSchema>
export type UpdatePaymentAccountStatusInput  = z.infer<typeof UpdatePaymentAccountStatusSchema>
export type UpdateDailyLimitInput            = z.infer<typeof UpdateDailyLimitSchema>
export type PaymentAccount                   = z.infer<typeof PaymentAccountSchema>
export type PaymentAccountListResponse       = z.infer<typeof PaymentAccountListResponseSchema>
