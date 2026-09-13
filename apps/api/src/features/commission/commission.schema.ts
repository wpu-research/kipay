import { z } from 'zod'

// ─── Rapor ───────────────────────────────────────────────────────────────
export const CommissionReportQuerySchema = z.object({
  from:       z.string().optional(),
  to:         z.string().optional(),
  tenantId:   z.string().uuid().optional(),
  merchantId: z.string().uuid().optional(),
})

const CommissionRowSchema = z.object({
  date:                 z.string(),
  merchantId:           z.string().uuid(),
  merchantName:         z.string(),
  method:               z.string(),
  depositAmount:        z.string(),
  depositCommission:    z.string(),
  withdrawalAmount:     z.string(),
  withdrawalCommission: z.string(),
})

const SettlementRowSchema = z.object({
  merchantId:     z.string().uuid(),
  settlementDate: z.string(),
  paidToUs:       z.string(),
  paidByUs:       z.string(),
  note:           z.string().nullable(),
})

export const CommissionReportResponseSchema = z.object({
  data:        z.array(CommissionRowSchema),
  settlements: z.array(SettlementRowSchema),
})

// ─── Oran CRUD ─────────────────────────────────────────────────────────────
export const CommissionRatesQuerySchema = z.object({
  merchantId: z.string().uuid().optional(),
})

export const CommissionRateUpsertSchema = z.object({
  merchantId:     z.string().uuid(),
  paymentMethod:  z.string().min(1).max(30),
  depositRate:    z.number().min(0).max(100),
  withdrawalRate: z.number().min(0).max(100),
})

export const CommissionRatesResponseSchema = z.object({
  data: z.array(z.object({
    id:             z.string().uuid(),
    merchantId:     z.string().uuid(),
    paymentMethod:  z.string(),
    depositRate:    z.string(),
    withdrawalRate: z.string(),
  })),
})

// ─── Mutabakat CRUD ────────────────────────────────────────────────────────
export const SettlementsQuerySchema = z.object({
  merchantId: z.string().uuid().optional(),
  from:       z.string().optional(),
  to:         z.string().optional(),
})

export const SettlementUpsertSchema = z.object({
  merchantId:     z.string().uuid(),
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD olmalı.'),
  paidToUs:       z.number().min(0),
  paidByUs:       z.number().min(0),
  note:           z.string().max(500).optional(),
})

export const SettlementsResponseSchema = z.object({
  data: z.array(SettlementRowSchema),
})
