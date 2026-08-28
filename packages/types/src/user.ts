import { z } from 'zod'
import { PaginatedResponseSchema } from './common.js'

const roleEnum = z.enum(['super_admin', 'tenant_admin', 'finans_admin', 'finans_operator', 'merchant'])

// Kullanıcı oluşturma şeması
export const CreateUserSchema = z.object({
  username: z.string()
    .min(3, 'Kullanıcı adı en az 3 karakter')
    .max(64)
    .regex(/^[a-z0-9_-]+$/, 'Kullanıcı adı yalnızca küçük harf, rakam, tire ve alt çizgi içerebilir'),
  password: z.string()
    .min(8, 'Şifre en az 8 karakter')
    .max(128, 'Şifre en fazla 128 karakter'),
  role: roleEnum,
  tenantId:   z.string().uuid().optional(), // Yalnızca super_admin kullanır
  merchantId: z.string().uuid().optional(), // Yalnızca merchant rolü için
})

// Kullanıcı engelleme şeması
export const BlockUserSchema = z.object({
  blockedUntil: z.string().datetime().optional(),
  permanent:    z.boolean().optional(),
})

// Status güncelleme şeması
export const UpdateUserStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

// Yanıt şemaları
export const UserSchema = z.object({
  id:         z.string().uuid(),
  username:   z.string(),
  role:       roleEnum,
  tenantId:   z.string().uuid(),
  tenantName: z.string().optional(),
  merchantId: z.string().uuid().nullable(),
  status:     z.enum(['active', 'inactive']),
  createdAt:  z.string(),
  updatedAt:  z.string(),
})

export const CreateUserResponseSchema = z.object({
  data: z.object({
    user: UserSchema,
  }),
})

export const UserListResponseSchema = PaginatedResponseSchema(UserSchema)
export const UserResponseSchema     = z.object({ data: UserSchema })

// Tipler
export type CreateUserInput       = z.infer<typeof CreateUserSchema>
export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatusSchema>
export type User                  = z.infer<typeof UserSchema>
export type CreateUserResponse    = z.infer<typeof CreateUserResponseSchema>
export type UserListResponse      = z.infer<typeof UserListResponseSchema>
