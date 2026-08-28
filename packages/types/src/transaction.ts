import { z } from 'zod'

export const TransactionStatusEnum = z.enum([
  'STARTED', 'PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'COMPLETED', 'FLAGGED',
  'TIMEOUT', 'CANCELLED',
])
export type TransactionStatus = z.infer<typeof TransactionStatusEnum>

// ─── userInfo (v1.1 addendum) ──────────────────────────────────
// Üye kimlik bloğu — sabit alan sırası, imzalı body'nin parçası.
// TC Kimlik No algoritma doğrulaması dahil.
function tcKimlikValid(tc: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false
  const d = tc.split('').map(Number)
  const d10 = ((d[0]! + d[2]! + d[4]! + d[6]! + d[8]!) * 7 - (d[1]! + d[3]! + d[5]! + d[7]!)) % 10
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10
  return d[9] === ((d10 % 10) + 10) % 10 && d[10] === d11
}

export const UserInfoSchema = z.object({
  identityNumber: z.string().refine(tcKimlikValid, {
    message: 'INVALID_IDENTITY_NUMBER: Geçersiz TC Kimlik No (11 hane, checksum).',
  }),
  memberId:  z.string().min(1),
  firstName: z.string().min(1).max(60),
  middleName: z.string().max(60).optional().default(''),
  lastName:  z.string().min(1).max(60),
  phone: z.string().regex(/^\+90[0-9]{10}$/, {
    message: 'INVALID_PHONE: E.164 formatı gerekli (+90XXXXXXXXXX).',
  }),
})
export type UserInfoInput = z.infer<typeof UserInfoSchema>

// POST /merchant/v1/deposit/initiate
export const InitiateTransactionSchema = z.object({
  externalUserId: z.string().min(1),
  amount:         z.string().regex(/^\d+(\.\d{1,2})?$/, 'Geçerli tutar formatı: "500" veya "500.00"'),
  currency:       z.string().min(1).max(10),
  userInfo:       UserInfoSchema,
}).superRefine((data, ctx) => {
  // memberId, externalUserId ile eşleşmeli
  if (data.userInfo.memberId !== data.externalUserId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['userInfo', 'memberId'],
      message: 'USER_ID_MISMATCH: userInfo.memberId, externalUserId ile aynı olmalı.',
    })
  }
})
export type InitiateTransactionInput = z.infer<typeof InitiateTransactionSchema>

// Response: POST /merchant/v1/deposit/initiate (v2 — hesap claim anında atanır)
export const InitiateTransactionResponseSchema = z.object({
  txId:           z.string().uuid(),
  status:         z.enum(['PENDING', 'STARTED']),
  amount:         z.string(),
  currency:       z.string(),
  depositAddress: z.string().optional(),
  accountName:    z.string().optional(),
  cryptoAmounts:  z.record(z.string()).optional(),
  expiresAt:      z.string().optional(),
})
export type InitiateTransactionResponse = z.infer<typeof InitiateTransactionResponseSchema>

// Claim sonrası webhook ile siteye gönderilen hesap bilgisi
export const DepositAccountAssignedSchema = z.object({
  txId:           z.string().uuid(),
  status:         z.literal('PROCESSING'),
  depositAddress: z.string(),
  accountName:    z.string(),
  bankName:       z.string().nullable(),
})
export type DepositAccountAssigned = z.infer<typeof DepositAccountAssignedSchema>

// POST /merchant/v1/deposit/player-confirmed response
export const PlayerConfirmedResponseSchema = z.object({
  txId:   z.string().uuid(),
  status: z.enum(['PROCESSING', 'PENDING']),
})
export type PlayerConfirmedResponse = z.infer<typeof PlayerConfirmedResponseSchema>

// POST /api/v1/transactions/:id/claim response
export const ClaimTransactionResponseSchema = z.object({
  id:               z.string().uuid(),
  tenantId:         z.string().uuid(),
  merchantId:       z.string().uuid(),
  paymentAccountId: z.string().uuid().nullable(),
  externalUserId:   z.string(),
  amount:           z.string(),
  currency:         z.string(),
  status:           z.literal('PROCESSING'),
  claimedBy:        z.string().uuid(),
  claimedAt:        z.string(),
  claimExpiresAt:   z.string(),
  resolvedBy:       z.string().uuid().nullable(),
  resolvedAt:       z.string().nullable(),
  note:             z.string().nullable(),
  createdAt:        z.string(),
  updatedAt:        z.string(),
  // Claim anında atanan hesap bilgisi
  depositAddress:   z.string().nullable(),
  accountName:      z.string().nullable(),
  bankName:         z.string().nullable(),
})
export type ClaimTransactionResponse = z.infer<typeof ClaimTransactionResponseSchema>

// POST /api/v1/transactions/:id/approve-with-amount body
export const ApproveWithAmountSchema = z.object({
  adjustedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Geçerli tutar formatı: "500.00"'),
})
export type ApproveWithAmountInput = z.infer<typeof ApproveWithAmountSchema>

// GET /api/v1/transactions response (paginated)
export const TransactionItemSchema = z.object({
  id:                 z.string().uuid(),
  tenantId:           z.string().uuid(),
  merchantId:         z.string().uuid(),
  paymentAccountId:   z.string().uuid().nullable(),
  externalUserId:     z.string(),
  amount:             z.string(),
  currency:           z.string(),
  status:             TransactionStatusEnum,
  type:               z.enum(['deposit', 'withdrawal']).nullable(),
  startedExpiresAt:   z.string().nullable(),
  paymentMethod:      z.string().nullable(),
  claimedBy:          z.string().uuid().nullable(),
  claimedAt:          z.string().nullable(),
  claimExpiresAt:     z.string().nullable(),
  resolvedBy:         z.string().uuid().nullable(),
  resolvedAt:         z.string().nullable(),
  note:               z.string().nullable(),
  createdAt:          z.string(),
  updatedAt:          z.string(),
  merchantName:       z.string().nullable(),
  paymentAccountName: z.string().nullable(),
  callbackStatus:     z.enum(['pending', 'sent', 'failed', 'dead']).nullable(),
  amountTry:          z.string().nullable(),
  exchangeRate:       z.string().nullable(),
  playerConfirmed:    z.boolean().default(false),
  playerConfirmedAt:  z.string().nullable(),
})

export const TransactionListSchema = z.object({
  data: z.array(TransactionItemSchema),
  meta: z.object({
    total:      z.number(),
    page:       z.number(),
    limit:      z.number(),
    totalPages: z.number(),
  }),
})
export type TransactionList = z.infer<typeof TransactionListSchema>

// POST /:id/resolve body (FLAGGED işlem kapatma — firma / super_admin)
// reason: z.string().optional() — boş/eksik reason serviste REASON_REQUIRED ile kontrol edilir
export const ResolveTransactionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason:   z.string().optional(),
})
export type ResolveTransactionInput = z.infer<typeof ResolveTransactionSchema>

// POST /:id/reject body
export const RejectTransactionSchema = z.object({ reason: z.string().min(1) })
export type RejectTransactionInput = z.infer<typeof RejectTransactionSchema>

// POST /:id/comments body
export const AddCommentSchema = z.object({ content: z.string().min(1) })
export type AddCommentInput = z.infer<typeof AddCommentSchema>

// Approve / Reject response = full transaction item
export const ApproveRejectResponseSchema = TransactionItemSchema
export type ApproveRejectResponse = z.infer<typeof ApproveRejectResponseSchema>

// Comment schema
export const TransactionCommentSchema = z.object({
  id:            z.string().uuid(),
  tenantId:      z.string().uuid(),
  transactionId: z.string().uuid(),
  userId:        z.string().uuid(),
  userRole:      z.string(),
  content:       z.string(),
  createdAt:     z.string(),
})
export type TransactionComment = z.infer<typeof TransactionCommentSchema>

// GET /:id detail response
export const TransactionDetailSchema = z.object({
  data: TransactionItemSchema.extend({
    withdrawalAccountName: z.string().nullable(),
    withdrawalAddress:     z.string().nullable(),
    withdrawalBankName:    z.string().nullable(),
    comments: z.array(TransactionCommentSchema),
    paymentAccount: z.object({
      type:          z.enum(['bank', 'crypto']),
      name:          z.string(),
      accountNumber: z.string(),
      bank:          z.object({ name: z.string() }).nullable(),
      cryptos:       z.array(z.object({
        crypto: z.object({ name: z.string(), symbol: z.string() }),
      })),
    }).nullable(),
  }),
})
export type TransactionDetail = z.infer<typeof TransactionDetailSchema>

// POST /api/v1/transactions/:id/retry-callback response
export const RetryCallbackResponseSchema = z.object({ jobId: z.string() })
export type RetryCallbackResponse = z.infer<typeof RetryCallbackResponseSchema>

// GET /api/v1/transactions/:id/callbacks response
export const CallbackListResponseSchema = z.object({
  data: z.array(
    z.object({
      id:             z.string().uuid(),
      transactionId:  z.string().uuid(),
      attemptNumber:  z.number().int(),
      sentAt:         z.string(),
      responseStatus: z.number().int().nullable(),
      responseBody:   z.string().nullable(),
      success:        z.boolean(),
      errorMessage:   z.string().nullable(),
    })
  ),
})
export type CallbackListResponse = z.infer<typeof CallbackListResponseSchema>

// GET /api/v1/callbacks/status-summary
export const CallbackStatusSummarySchema = z.object({
  pending: z.number(),
  sent:    z.number(),
  failed:  z.number(),
  dead:    z.number(),
})
export type CallbackStatusSummary = z.infer<typeof CallbackStatusSummarySchema>

// GET /api/v1/callbacks — global callback log listesi
export const GlobalCallbackItemSchema = z.object({
  id:             z.string().uuid(),
  transactionId:  z.string().uuid(),
  attemptNumber:  z.number().int(),
  sentAt:         z.string(),
  responseStatus: z.number().int().nullable(),
  responseBody:   z.string().nullable(),
  success:        z.boolean(),
  errorMessage:   z.string().nullable(),
  merchantId:     z.string().uuid().nullable(),
  merchantName:   z.string().nullable(),
  txStatus:       z.string().nullable(),
  txAmount:       z.string().nullable(),
  txCurrency:     z.string().nullable(),
})
export type GlobalCallbackItem = z.infer<typeof GlobalCallbackItemSchema>

export const GlobalCallbackListResponseSchema = z.object({
  data: z.array(GlobalCallbackItemSchema),
  meta: z.object({
    total:      z.number(),
    page:       z.number(),
    limit:      z.number(),
    totalPages: z.number(),
  }),
})
export type GlobalCallbackListResponse = z.infer<typeof GlobalCallbackListResponseSchema>

// Transaction record response (internal panel use)
export const TransactionResponseSchema = z.object({
  data: z.object({
    id:               z.string().uuid(),
    tenantId:         z.string().uuid(),
    merchantId:       z.string().uuid(),
    paymentAccountId: z.string().uuid().nullable(),
    externalUserId:   z.string(),
    amount:           z.string(),
    currency:         z.string(),
    status:           TransactionStatusEnum,
    claimedBy:        z.string().uuid().nullable(),
    claimedAt:        z.string().nullable(),
    claimExpiresAt:   z.string().nullable(),
    resolvedBy:       z.string().uuid().nullable(),
    resolvedAt:       z.string().nullable(),
    note:             z.string().nullable(),
    createdAt:        z.string(),
    updatedAt:        z.string(),
  }),
})
export type TransactionResponse = z.infer<typeof TransactionResponseSchema>
