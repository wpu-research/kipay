import { randomBytes } from 'node:crypto'
import { db, merchantApiKeys, merchantIpWhitelist, merchants, eq, and } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import { encryptSecret } from '../../lib/secret-crypto.js'
import type { CreateApiKeyInput } from '@panel/types'

function generateApiKey() {
  const keyId           = 'key_' + randomBytes(8).toString('hex')
  const secret          = 'sk_'  + randomBytes(32).toString('hex')
  const secretEncrypted = encryptSecret(secret)   // geri-döndürülebilir (keyId-only auth için)
  return { keyId, secret, secretEncrypted }
}

function toPublic(apiKey: {
  id: string
  merchantId: string
  keyId: string
  label: string | null
  status: 'active' | 'revoked'
  revokedAt: Date | null
  createdAt: Date
}) {
  return {
    id:         apiKey.id,
    merchantId: apiKey.merchantId,
    keyId:      apiKey.keyId,
    label:      apiKey.label,
    status:     apiKey.status,
    revokedAt:  apiKey.revokedAt?.toISOString() ?? null,
    createdAt:  apiKey.createdAt.toISOString(),
  }
}

function normalizeIp(ip: string): string {
  return ip.trim().toLowerCase()
}

export const merchantApiKeyService = {

  async assertMerchantBelongsToTenant(tenantId: string, merchantId: string) {
    const merchant = await db.query.merchants.findFirst({
      where: and(eq(merchants.id, merchantId), eq(merchants.tenantId, tenantId)),
    })
    if (!merchant) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
    return merchant
  },

  async createApiKey(tenantId: string, merchantId: string, data: CreateApiKeyInput) {
    await this.assertMerchantBelongsToTenant(tenantId, merchantId)
    const { keyId, secret, secretEncrypted } = generateApiKey()
    try {
      const [apiKey] = await db.insert(merchantApiKeys).values({
        merchantId,
        tenantId,
        keyId,
        secretEncrypted,
        label: data.label ?? null,
      }).returning()
      return { ...toPublic(apiKey!), secret }
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('KEY_ID_COLLISION', 'API key oluşturma çakışması, lütfen tekrar deneyin.', 409)
      }
      throw err
    }
  },

  async getApiKeys(tenantId: string, merchantId: string) {
    await this.assertMerchantBelongsToTenant(tenantId, merchantId)
    const keys = await db.query.merchantApiKeys.findMany({
      where: and(
        eq(merchantApiKeys.merchantId, merchantId),
        eq(merchantApiKeys.tenantId, tenantId),
      ),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    })
    return keys.map(toPublic)
  },

  async revokeApiKey(tenantId: string, merchantId: string, keyId: string) {
    await this.assertMerchantBelongsToTenant(tenantId, merchantId)
    const rows = await db.update(merchantApiKeys)
      .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(merchantApiKeys.keyId, keyId),
        eq(merchantApiKeys.merchantId, merchantId),
        eq(merchantApiKeys.tenantId, tenantId),
        eq(merchantApiKeys.status, 'active'),
      ))
      .returning()
    if (rows.length === 0) throw new AppError('NOT_FOUND', 'API key bulunamadı veya zaten iptal edilmiş.', 404)
    return toPublic(rows[0]!)
  },

  async rotateApiKey(tenantId: string, merchantId: string, keyId: string) {
    await this.assertMerchantBelongsToTenant(tenantId, merchantId)
    const { secret, secretEncrypted } = generateApiKey()
    const rows = await db.update(merchantApiKeys)
      .set({ secretEncrypted, updatedAt: new Date() })
      .where(and(
        eq(merchantApiKeys.keyId, keyId),
        eq(merchantApiKeys.merchantId, merchantId),
        eq(merchantApiKeys.tenantId, tenantId),
        eq(merchantApiKeys.status, 'active'),
      ))
      .returning()
    if (rows.length === 0) throw new AppError('NOT_FOUND', 'Aktif API key bulunamadı.', 404)
    return { ...toPublic(rows[0]!), secret }
  },

  async addIp(tenantId: string, merchantId: string, ipAddress: string) {
    await this.assertMerchantBelongsToTenant(tenantId, merchantId)
    const normalizedIp = normalizeIp(ipAddress)
    try {
      const [entry] = await db.insert(merchantIpWhitelist).values({
        merchantId,
        tenantId,
        ipAddress: normalizedIp,
      }).returning()
      return { id: entry!.id, merchantId, ipAddress: normalizedIp, createdAt: entry!.createdAt.toISOString() }
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('IP_ALREADY_EXISTS', "Bu IP adresi zaten whitelist'te.", 409)
      }
      throw err
    }
  },

  async getIpWhitelist(tenantId: string, merchantId: string) {
    await this.assertMerchantBelongsToTenant(tenantId, merchantId)
    const entries = await db.query.merchantIpWhitelist.findMany({
      where: and(
        eq(merchantIpWhitelist.merchantId, merchantId),
        eq(merchantIpWhitelist.tenantId, tenantId),
      ),
      orderBy: (t, { asc }) => [asc(t.createdAt)],
    })
    return entries.map(e => ({ id: e.id, merchantId: e.merchantId, ipAddress: e.ipAddress, createdAt: e.createdAt.toISOString() }))
  },

  async removeIp(tenantId: string, merchantId: string, ipAddress: string) {
    await this.assertMerchantBelongsToTenant(tenantId, merchantId)
    const normalizedIp = normalizeIp(ipAddress)
    const rows = await db.delete(merchantIpWhitelist)
      .where(and(
        eq(merchantIpWhitelist.merchantId, merchantId),
        eq(merchantIpWhitelist.tenantId, tenantId),
        eq(merchantIpWhitelist.ipAddress, normalizedIp),
      ))
      .returning()
    if (rows.length === 0) throw new AppError('NOT_FOUND', "IP adresi whitelist'te bulunamadı.", 404)
  },
}
