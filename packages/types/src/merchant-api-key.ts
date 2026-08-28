import { z } from 'zod'

// API Key şemaları
export const CreateApiKeySchema = z.object({
  label: z.string().max(128).optional(),
})

// Masked API key (listede gösterilen — secret içermez)
export const ApiKeyPublicSchema = z.object({
  id:         z.string().uuid(),
  merchantId: z.string().uuid(),
  keyId:      z.string(),
  label:      z.string().nullable(),
  status:     z.enum(['active', 'revoked']),
  revokedAt:  z.string().nullable(),
  createdAt:  z.string(),
})

// One-time secret ile dönen schema (create / rotate)
export const ApiKeyCreatedSchema = ApiKeyPublicSchema.extend({
  secret: z.string(),
})

// Geriye dönük uyumluluk için alias
export const ApiKeySchema = ApiKeyPublicSchema

export const ApiKeyListResponseSchema    = z.object({ data: z.array(ApiKeyPublicSchema) })
export const ApiKeyCreatedResponseSchema = z.object({ data: ApiKeyCreatedSchema })

// IP Whitelist şemaları
export const AddIpSchema = z.object({
  ipAddress: z.string().ip({ message: 'Geçerli bir IPv4 veya IPv6 adresi giriniz' }),
})

export const IpEntrySchema = z.object({
  id:         z.string().uuid(),
  merchantId: z.string().uuid(),
  ipAddress:  z.string(),
  createdAt:  z.string(),
})

export const IpWhitelistResponseSchema = z.object({ data: z.array(IpEntrySchema) })

// Tipler
export type CreateApiKeyInput    = z.infer<typeof CreateApiKeySchema>
export type ApiKey               = z.infer<typeof ApiKeyPublicSchema>
export type ApiKeyCreated        = z.infer<typeof ApiKeyCreatedSchema>
export type ApiKeyListResponse   = z.infer<typeof ApiKeyListResponseSchema>
export type AddIpInput           = z.infer<typeof AddIpSchema>
export type IpEntry              = z.infer<typeof IpEntrySchema>
export type IpWhitelistResponse  = z.infer<typeof IpWhitelistResponseSchema>
