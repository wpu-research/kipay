import { z } from 'zod'

export const ExchangeRateSchema = z.object({
  id:           z.string().uuid(),
  fromCurrency: z.string(),
  toCurrency:   z.string(),
  rate:         z.string(),
  source:       z.string(),
  fetchedAt:    z.string(),
  createdAt:    z.string(),
})

export const CurrentRatesResponseSchema = z.object({
  data: z.array(ExchangeRateSchema),
  meta: z.object({
    total: z.number().int(),
    page:  z.number().int(),
    limit: z.number().int(),
  }),
})

export const SyncRatesResponseSchema = z.object({
  synced:    z.number().int(),
  source:    z.string(),
  fetchedAt: z.string(),
})

export const ExchangeRateHistoryResponseSchema = z.object({
  data: z.array(ExchangeRateSchema),
  meta: z.object({
    total: z.number().int(),
    page:  z.number().int(),
    limit: z.number().int(),
  }),
})

export type ExchangeRateItem            = z.infer<typeof ExchangeRateSchema>
export type CurrentRatesResponse        = z.infer<typeof CurrentRatesResponseSchema>
export type SyncRatesResponse           = z.infer<typeof SyncRatesResponseSchema>
export type ExchangeRateHistoryResponse = z.infer<typeof ExchangeRateHistoryResponseSchema>
