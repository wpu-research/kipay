import { z } from 'zod'

export const ExchangeRateResponseSchema = z.object({
  id:           z.string().uuid(),
  fromCurrency: z.string(),
  toCurrency:   z.string(),
  rate:         z.string(),
  source:       z.string(),
  fetchedAt:    z.string(),
  createdAt:    z.string(),
})

export const CurrentRatesResponseSchema = z.object({
  data: z.array(ExchangeRateResponseSchema),
  meta: z.object({
    total: z.number().int(),
    page:  z.number().int(),
    limit: z.number().int(),
  }),
})

export const SyncResponseSchema = z.object({
  synced:    z.number().int(),
  source:    z.string(),
  fetchedAt: z.string(),
})

export const ExchangeRateHistoryQuerySchema = z.object({
  currency: z.string().optional(),
  from:     z.string().optional(),
  to:       z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(50),
})

export const ExchangeRateHistoryResponseSchema = z.object({
  data: z.array(ExchangeRateResponseSchema),
  meta: z.object({
    total: z.number().int(),
    page:  z.number().int(),
    limit: z.number().int(),
  }),
})

