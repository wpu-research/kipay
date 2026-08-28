import { z } from 'zod'

export const WarningRuleTypeSchema = z.enum([
  'transaction_frequency',
  'amount_threshold',
  'repeat_rejection',
])

export const CreateWarningRuleSchema = z.object({
  ruleType:      WarningRuleTypeSchema,
  threshold:     z.number().positive(),
  windowMinutes: z.number().int().positive().optional(), // frequency/rejection için zorunlu
  merchantId:    z.string().uuid().optional(),           // null = tenant scope
})
export type CreateWarningRuleInput = z.infer<typeof CreateWarningRuleSchema>

export const UpdateWarningRuleStatusSchema = z.object({
  isActive: z.boolean(),
})

export const WarningRuleItemSchema = z.object({
  id:            z.string().uuid(),
  tenantId:      z.string().uuid(),
  merchantId:    z.string().uuid().nullable(),
  ruleType:      WarningRuleTypeSchema,
  threshold:     z.string(),   // numeric → string (Drizzle numeric serialization)
  windowMinutes: z.number().nullable(),
  isActive:      z.boolean(),
  createdBy:     z.string().uuid(),
  createdAt:     z.string(),
  updatedAt:     z.string(),
})

export const WarningItemSchema = z.object({
  id:             z.string().uuid(),
  tenantId:       z.string().uuid(),
  ruleId:         z.string().uuid(),
  transactionId:  z.string().uuid().nullable(),
  status:         z.enum(['open', 'acknowledged']),
  triggeredAt:    z.string(),
  acknowledgedBy: z.string().uuid().nullable(),
  acknowledgedAt: z.string().nullable(),
  metadata:       z.record(z.unknown()).nullable(),
  createdAt:      z.string(),
})

export const PaginatedWarningRulesSchema = z.object({
  data:  z.array(WarningRuleItemSchema),
  meta:  z.object({ total: z.number(), page: z.number(), limit: z.number() }),
})

export const PaginatedWarningsSchema = z.object({
  data:  z.array(WarningItemSchema),
  meta:  z.object({ total: z.number(), page: z.number(), limit: z.number() }),
})
