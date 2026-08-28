import { z } from 'zod'

export const UpdateClaimTimeoutBodySchema = z.object({
  timeoutMinutes: z.number().int(),  // range 5-60; route'da INVALID_TIMEOUT kodu ile doğrulanır
})

export const UpdateTotpRequiredBodySchema = z.object({
  totpRequired: z.boolean(),
})

export const SettingsResponseSchema = z.object({
  claimTimeoutMinutes: z.number().int(),
  totpRequired: z.boolean(),
})

export type UpdateClaimTimeoutBody   = z.infer<typeof UpdateClaimTimeoutBodySchema>
export type UpdateTotpRequiredBody   = z.infer<typeof UpdateTotpRequiredBodySchema>
export type SettingsResponse         = z.infer<typeof SettingsResponseSchema>
