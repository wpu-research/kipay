import { z } from 'zod'
import { TransactionStatusEnum, UserInfoSchema } from './transaction.js'

// POST /merchant/v1/deposit/confirm
export const DepositConfirmSchema = z.object({
  txId:     z.string().uuid(),
  currency: z.string().min(1).max(10).optional(),
})
export type DepositConfirmInput = z.infer<typeof DepositConfirmSchema>

export const DepositConfirmResponseSchema = z.object({
  txId:   z.string().uuid(),
  status: z.literal('PENDING'),
})
export type DepositConfirmResponse = z.infer<typeof DepositConfirmResponseSchema>

// POST /merchant/v1/withdrawal/request
export const WithdrawalRequestSchema = z.object({
  externalUserId:     z.string().min(1),
  amount:             z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency:           z.string().min(1).max(10),
  paymentMethod:          z.string().min(1),
  withdrawalAddress:      z.string().min(1),
  withdrawalAccountName:  z.string().min(1),
  userInfo:               UserInfoSchema,
}).superRefine((data, ctx) => {
  if (data.paymentMethod.toUpperCase() === 'IBAN' && !/^TR\d{24}$/.test(data.withdrawalAddress)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['withdrawalAddress'],
      message: 'Geçersiz IBAN formatı. Beklenen format: TR + 24 rakam.',
    })
  }
  if (data.userInfo.memberId !== data.externalUserId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['userInfo', 'memberId'],
      message: 'USER_ID_MISMATCH: userInfo.memberId, externalUserId ile aynı olmalı.',
    })
  }
  // NAME_MISMATCH: hesap sahibi adı, üye ad-soyadıyla eşleşmeli (TR normalize, case-insensitive)
  const trFold = (s: string) => {
    const m: Record<string, string> = { 'İ':'i','I':'i','ı':'i','Ş':'s','ş':'s','Ğ':'g','ğ':'g','Ü':'u','ü':'u','Ö':'o','ö':'o','Ç':'c','ç':'c' }
    return s.replace(/[İIıŞşĞğÜüÖöÇç]/g, c => m[c] ?? c).toLowerCase().split(/\s+/).filter(Boolean).join(' ')
  }
  const fullName = [data.userInfo.firstName, data.userInfo.middleName, data.userInfo.lastName].filter(Boolean).join(' ')
  if (trFold(data.withdrawalAccountName) !== trFold(fullName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['withdrawalAccountName'],
      message: 'NAME_MISMATCH: Hesap sahibi adı, üye ad-soyadıyla eşleşmiyor.',
    })
  }
})
export type WithdrawalRequestInput = z.infer<typeof WithdrawalRequestSchema>

export const WithdrawalResponseSchema = z.object({
  txId:                  z.string().uuid(),
  status:                z.literal('PENDING'),
  withdrawalAddress:     z.string(),
  withdrawalAccountName: z.string(),
})
export type WithdrawalResponse = z.infer<typeof WithdrawalResponseSchema>

// GET /merchant/v1/transactions/:txId & /transactions
export const MerchantTransactionItemSchema = z.object({
  txId:           z.string().uuid(),
  status:         TransactionStatusEnum,
  type:           z.enum(['deposit', 'withdrawal']).nullable(),
  amount:         z.string(),
  currency:       z.string(),
  externalUserId: z.string(),
  paymentMethod:  z.string().nullable(),
  userInfo:       UserInfoSchema.optional(),
  createdAt:      z.string(),
  updatedAt:      z.string(),
})
export type MerchantTransactionItem = z.infer<typeof MerchantTransactionItemSchema>

export const MerchantTransactionDetailResponseSchema = z.object({
  data: MerchantTransactionItemSchema,
})

export const MerchantTransactionListQuerySchema = z.object({
  status:   TransactionStatusEnum.optional(),
  type:     z.enum(['deposit', 'withdrawal']).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo:   z.string().datetime({ offset: true }).optional(),
  page:     z.coerce.number().int().min(1).max(1000).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
})
export type MerchantTransactionListQuery = z.infer<typeof MerchantTransactionListQuerySchema>

export const MerchantTransactionListResponseSchema = z.object({
  data: z.array(MerchantTransactionItemSchema),
  meta: z.object({
    total:      z.number(),
    page:       z.number(),
    limit:      z.number(),
    totalPages: z.number(),
  }),
})

// GET /merchant/v1/payment-methods
export const PaymentMethodItemSchema = z.object({
  name: z.string(),
})
export const PaymentMethodsResponseSchema = z.object({
  data: z.array(PaymentMethodItemSchema),
})

// Callback payload (outbound webhook)
export const CallbackPayloadSchema = z.object({
  txId:           z.string().uuid(),
  status:         TransactionStatusEnum,
  type:           z.enum(['deposit', 'withdrawal']).nullable(),
  amount:         z.string(),
  currency:       z.string(),
  externalUserId: z.string(),
  userInfo:       UserInfoSchema.optional(),
  revision:       z.boolean().optional(),
  previousStatus: z.enum(['REJECTED', 'TIMEOUT']).optional(),
  originalAmount: z.string().optional(),
  timestamp:      z.string(),
  signature:      z.string(),
})
export type CallbackPayload = z.infer<typeof CallbackPayloadSchema>

export const CallbackLogItemSchema = z.object({
  id:             z.string().uuid(),
  transactionId:  z.string().uuid(),
  attemptNumber:  z.number().int(),
  sentAt:         z.string(),
  responseStatus: z.number().int().nullable(),
  responseBody:   z.string().nullable(),
  success:        z.boolean(),
  errorMessage:   z.string().nullable(),
})
export type CallbackLogItem = z.infer<typeof CallbackLogItemSchema>

// POST /merchant/v1/sandbox/simulate-callback
export const SimulateCallbackRequestSchema = z.object({
  txId:   z.string().uuid(),
  status: z.enum(['COMPLETED', 'REJECTED', 'TIMEOUT']),
})
export type SimulateCallbackRequest = z.infer<typeof SimulateCallbackRequestSchema>

export const SimulateCallbackResponseSchema = z.object({
  success:   z.boolean(),
  attemptId: z.string().uuid(),
})
export type SimulateCallbackResponse = z.infer<typeof SimulateCallbackResponseSchema>

// GET /merchant/v1/exchange-rates
export const ExchangeRateItemSchema = z.object({
  fromCurrency: z.string(),
  toCurrency:   z.string(),
  rate:         z.string(),
  source:       z.string(),
  fetchedAt:    z.string(),
  stale:        z.boolean(),
})
export const ExchangeRatesResponseSchema = z.object({
  data: z.array(ExchangeRateItemSchema),
})
