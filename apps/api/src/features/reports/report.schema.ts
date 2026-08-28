import { z } from 'zod'

// --- Export şemaları ---

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

// --- Query şemaları ---

export const TransactionReportQuerySchema = z.object({
  from:               z.string().optional(),
  to:                 z.string().optional(),
  merchantId:         z.string().uuid().optional(),
  paymentProviderId:  z.string().uuid().optional(),
  status:             z.string().optional(),
  tenantId:           z.string().uuid().optional(),
})

export const CallbackReportQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
})

// --- Yanıt şemaları ---

export const TransactionReportResponseSchema = z.object({
  data: z.object({
    totalAmount:      z.string(),
    transactionCount: z.number().int(),
    averageAmount:    z.string(),
    currency:         z.string().nullable(),
    dailyBuckets: z.array(z.object({
      date:        z.string(),
      count:       z.number().int(),
      totalAmount: z.string(),
    })),
    statusDistribution: z.array(z.object({
      status: z.string(),
      count:  z.number().int(),
    })),
    filters: z.object({
      from: z.string().optional(),
      to:   z.string().optional(),
    }),
  }),
})


export const CallbackReportResponseSchema = z.object({
  data: z.object({
    successRate:     z.number(),
    avgAttemptCount: z.number().nullable(),
    deadLetterCount: z.number().int(),
  }),
})

export const MerchantDailyReportQuerySchema = z.object({
  from:     z.string().optional(),
  to:       z.string().optional(),
  tenantId: z.string().uuid().optional(),
})

export const MerchantDailyReportResponseSchema = z.object({
  data: z.array(z.object({
    date:           z.string(),
    merchantId:     z.string().uuid(),
    merchantName:   z.string(),
    count:          z.number().int(),
    totalAmountTry: z.string(),
  })),
})
