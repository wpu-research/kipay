import { z } from 'zod'

export const ExportRequestBodySchema = z.object({
  format:            z.enum(['csv', 'xlsx']),
  from:              z.string().optional(),
  to:                z.string().optional(),
  merchantId:        z.string().uuid().optional(),
  paymentProviderId: z.string().uuid().optional(),
  status:            z.string().optional(),
  tenantId:          z.string().uuid().optional(),
})

export const ExportJobStatusSchema = z.object({
  jobId:       z.string().uuid(),
  status:      z.enum(['pending', 'processing', 'completed', 'failed']),
  format:      z.string(),
  createdAt:   z.string(),
  expiresAt:   z.string().nullable().optional(),
  downloadUrl: z.string().optional(),
})

export type ExportRequestBody = z.infer<typeof ExportRequestBodySchema>
export type ExportJobStatus   = z.infer<typeof ExportJobStatusSchema>

export const DailyBucketSchema = z.object({
  date:        z.string(),
  count:       z.number().int(),
  totalAmount: z.string(),
})

export const StatusBucketSchema = z.object({
  status: z.string(),
  count:  z.number().int(),
})

export const TransactionReportSchema = z.object({
  totalAmount:        z.string(),
  transactionCount:   z.number().int(),
  averageAmount:      z.string(),
  currency:           z.string().nullable(),
  dailyBuckets:       z.array(DailyBucketSchema),
  statusDistribution: z.array(StatusBucketSchema),
  filters: z.object({
    from:    z.string().optional(),
    to:      z.string().optional(),
  }),
})

export const CallbackReportSchema = z.object({
  successRate:     z.number(),
  avgAttemptCount: z.number().nullable(),
  deadLetterCount: z.number().int(),
})

export const TransactionReportResponseSchema = z.object({
  data: TransactionReportSchema,
})

export const CallbackReportResponseSchema = z.object({
  data: CallbackReportSchema,
})

export type DailyBucket               = z.infer<typeof DailyBucketSchema>
export type StatusBucket              = z.infer<typeof StatusBucketSchema>
export type TransactionReport         = z.infer<typeof TransactionReportSchema>
export type CallbackReport            = z.infer<typeof CallbackReportSchema>
export type TransactionReportResponse = z.infer<typeof TransactionReportResponseSchema>
export type CallbackReportResponse    = z.infer<typeof CallbackReportResponseSchema>

export interface TransactionReportFilters {
  from?:              string
  to?:                string
  merchantId?:        string
  paymentProviderId?: string
  status?:            string
  tenantId?:          string
}

export const MerchantDailyRowSchema = z.object({
  date:           z.string(),
  merchantId:     z.string().uuid(),
  merchantName:   z.string(),
  count:          z.number().int(),
  totalAmountTry: z.string(),
})

export const MerchantDailyReportResponseSchema = z.object({
  data: z.array(MerchantDailyRowSchema),
})

export type MerchantDailyRow            = z.infer<typeof MerchantDailyRowSchema>
export type MerchantDailyReportResponse = z.infer<typeof MerchantDailyReportResponseSchema>

export interface MerchantDailyReportFilters {
  from?:     string
  to?:       string
  tenantId?: string
}
