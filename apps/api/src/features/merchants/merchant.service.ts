import { randomBytes } from 'node:crypto'
import { db, merchants, tenants, transactions, blockedPlayers, warningRules, eq, and, sql } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import type { CreateMerchantInput } from '@panel/types'

export const merchantService = {

  async createMerchant(tenantId: string, data: CreateMerchantInput) {
    const existing = await db.query.merchants.findFirst({
      where: and(
        eq(merchants.tenantId, tenantId),
        eq(merchants.merchantName, data.merchantName),
      ),
    })
    if (existing) {
      throw new AppError('MERCHANT_NAME_CONFLICT', 'Bu merchant adı zaten kullanılıyor.', 409)
    }

    try {
      const callbackSecret = randomBytes(32).toString('hex')
      const [merchant] = await db.insert(merchants).values({
        tenantId,
        merchantName:   data.merchantName,
        webhookUrl:     data.webhookUrl,
        isSandbox:      data.isSandbox ?? true,
        callbackSecret,
      }).returning()
      return merchant!
    } catch (err: unknown) {
      // DB unique constraint ihlali (race condition senaryosu)
      if (err instanceof Error && err.message.includes('merchants_tenant_name_unique')) {
        throw new AppError('MERCHANT_NAME_CONFLICT', 'Bu merchant adı zaten kullanılıyor.', 409)
      }
      throw err
    }
  },

  async getMerchants(tenantId: string | undefined, page: number, limit: number) {
    return db.transaction(async (tx) => {
      const where = tenantId ? eq(merchants.tenantId, tenantId) : undefined

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(merchants)
        .where(where)

      const totalPages = Math.max(1, Math.ceil(count / limit))
      const safePage   = Math.max(1, Math.min(page, totalPages))
      const offset     = (safePage - 1) * limit

      const data = await tx
        .select({
          id:             merchants.id,
          tenantId:       merchants.tenantId,
          tenantName:     tenants.name,
          merchantName:   merchants.merchantName,
          webhookUrl:     merchants.webhookUrl,
          isSandbox:      merchants.isSandbox,
          status:         merchants.status,
          callbackSecret: merchants.callbackSecret,
          createdAt:      merchants.createdAt,
          updatedAt:      merchants.updatedAt,
        })
        .from(merchants)
        .leftJoin(tenants, eq(merchants.tenantId, tenants.id))
        .where(where)
        .orderBy(merchants.createdAt)
        .limit(limit)
        .offset(offset)

      return { data, meta: { total: count, page: safePage, limit } }
    })
  },

  async getMerchantById(tenantId: string, merchantId: string) {
    const rows = await db
      .select({
        id:             merchants.id,
        tenantId:       merchants.tenantId,
        tenantName:     tenants.name,
        merchantName:   merchants.merchantName,
        webhookUrl:     merchants.webhookUrl,
        isSandbox:      merchants.isSandbox,
        status:         merchants.status,
        callbackSecret: merchants.callbackSecret,
        createdAt:      merchants.createdAt,
        updatedAt:      merchants.updatedAt,
      })
      .from(merchants)
      .leftJoin(tenants, eq(merchants.tenantId, tenants.id))
      .where(and(eq(merchants.tenantId, tenantId), eq(merchants.id, merchantId)))
      .limit(1)
    if (rows.length === 0) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
    return rows[0]!
  },

  async getMerchantByIdUnscoped(merchantId: string) {
    const rows = await db
      .select({
        id:             merchants.id,
        tenantId:       merchants.tenantId,
        tenantName:     tenants.name,
        merchantName:   merchants.merchantName,
        webhookUrl:     merchants.webhookUrl,
        isSandbox:      merchants.isSandbox,
        status:         merchants.status,
        callbackSecret: merchants.callbackSecret,
        createdAt:      merchants.createdAt,
        updatedAt:      merchants.updatedAt,
      })
      .from(merchants)
      .leftJoin(tenants, eq(merchants.tenantId, tenants.id))
      .where(eq(merchants.id, merchantId))
      .limit(1)
    if (rows.length === 0) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
    return rows[0]!
  },

  async toggleSandbox(tenantId: string, merchantId: string, isSandbox: boolean) {
    const rows = await db.update(merchants)
      .set({ isSandbox, updatedAt: new Date() })
      .where(and(eq(merchants.tenantId, tenantId), eq(merchants.id, merchantId)))
      .returning()
    if (rows.length === 0) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
    return rows[0]!
  },

  async updateMerchantStatus(tenantId: string, merchantId: string, status: 'active' | 'inactive') {
    const rows = await db.update(merchants)
      .set({ status, updatedAt: new Date() })
      .where(and(
        eq(merchants.tenantId, tenantId),
        eq(merchants.id, merchantId),
      ))
      .returning()

    if (rows.length === 0) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
    return rows[0]!
  },

  async regenerateCallbackSecret(tenantId: string, merchantId: string) {
    const callbackSecret = randomBytes(32).toString('hex')
    const rows = await db.update(merchants)
      .set({ callbackSecret, updatedAt: new Date() })
      .where(and(eq(merchants.tenantId, tenantId), eq(merchants.id, merchantId)))
      .returning()
    if (rows.length === 0) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
    return rows[0]!
  },

  async deleteMerchant(tenantId: string, merchantId: string) {
    const merchant = await db.query.merchants.findFirst({
      where: and(eq(merchants.id, merchantId), eq(merchants.tenantId, tenantId)),
    })
    if (!merchant) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)

    // Transaction var mı kontrol et — varsa silmeyi engelle
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.merchantId, merchantId))
    if (count > 0) {
      throw new AppError('MERCHANT_HAS_TRANSACTIONS', `Bu merchant'a ait ${count} işlem mevcut. Silinemez.`, 409)
    }

    await db.transaction(async (tx) => {
      await tx.delete(blockedPlayers).where(eq(blockedPlayers.merchantId, merchantId))
      await tx.delete(warningRules).where(eq(warningRules.merchantId, merchantId))
      // merchant_api_keys ve merchant_ip_whitelist cascade ile silinir
      await tx.delete(merchants).where(eq(merchants.id, merchantId))
    })
  },
}
