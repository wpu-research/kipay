import { z } from 'zod'

const roleEnum = z.enum(['super_admin', 'tenant_admin', 'finans_admin', 'finans_operator', 'merchant'])

// İstek şemaları
export const LoginSchema = z.object({
  username: z.string().min(1, 'Kullanıcı adı gerekli').max(64),
  password: z.string().min(1, 'Şifre gerekli').max(128),
})

export const TwoFactorVerifySchema = z.object({
  code: z.string().length(6, '2FA kodu 6 haneli olmalı').regex(/^\d{6}$/, '2FA kodu yalnızca rakam içermeli'),
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut şifre gerekli'),
  newPassword:     z.string().min(8, 'Yeni şifre en az 8 karakter olmalı').max(128, 'Yeni şifre en fazla 128 karakter olabilir'),
})

// JWT payload şemaları
export const JwtPayloadSchema = z.object({
  userId:         z.string().uuid(),
  username:       z.string(),
  role:           roleEnum,
  tenantId:       z.string().uuid(),
  merchantId:     z.string().uuid().optional(),
  sessionId:      z.string().uuid(),
  masquerading:   z.boolean().optional(),
  originalUserId: z.string().uuid().optional(),
})

export const TempJwtPayloadSchema = z.object({
  userId: z.string().uuid(),
  step: z.literal('2fa'),
})

// Oturum şemaları
export const SessionSchema = z.object({
  id:        z.string().uuid(),
  ip:        z.string(),
  userAgent: z.string(),
  createdAt: z.string(),
  current:   z.boolean(),
})

export const SessionListResponseSchema = z.object({
  data: z.array(SessionSchema),
})

// Yanıt şemaları
export const AuthUserSchema = z.object({
  id:             z.string().uuid(),
  username:       z.string(),
  role:           roleEnum,
  tenantId:       z.string().uuid(),
  merchantId:     z.string().uuid().nullable().optional(),
  masquerading:   z.boolean().optional(),
  originalUserId: z.string().uuid().optional(),
})

export const MasqueradeResponseSchema = z.object({
  success: z.boolean(),
  targetUser: z.object({
    id:       z.string().uuid(),
    username: z.string(),
    role:     roleEnum,
  }),
})

export const LoginResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('2FA_REQUIRED') }),
  z.object({ status: z.literal('LOGGED_IN'), user: AuthUserSchema }),
])

export const VerifyResponseSchema = z.object({
  user: AuthUserSchema,
})

export const MeResponseSchema = z.object({
  user: AuthUserSchema,
})

export type LoginInput           = z.infer<typeof LoginSchema>
export type TwoFactorVerifyInput = z.infer<typeof TwoFactorVerifySchema>
export type ChangePasswordInput  = z.infer<typeof ChangePasswordSchema>
export type JwtPayload           = z.infer<typeof JwtPayloadSchema>
export type TempJwtPayload       = z.infer<typeof TempJwtPayloadSchema>
export type AuthUser             = z.infer<typeof AuthUserSchema>
export type LoginResponse        = z.infer<typeof LoginResponseSchema>
export type SessionItem          = z.infer<typeof SessionSchema>
export type MasqueradeResponse   = z.infer<typeof MasqueradeResponseSchema>
