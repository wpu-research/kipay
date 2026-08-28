import { db, paymentAccounts, paymentAccountCryptos, banks, cryptos, eq, and, sql, inArray } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import type { CreatePaymentAccountInput, UpdatePaymentAccountInput, UpdatePaymentAccountStatusInput, UpdateDailyLimitInput } from '@panel/types'

async function attachRelations(rows: (typeof paymentAccounts.$inferSelect)[]) {
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)

  // Kripto ilişkileri
  const cryptoLinks = await db
    .select({ paymentAccountId: paymentAccountCryptos.paymentAccountId, cryptoId: paymentAccountCryptos.cryptoId })
    .from(paymentAccountCryptos)
    .where(inArray(paymentAccountCryptos.paymentAccountId, ids))

  const cryptoIds = [...new Set(cryptoLinks.map((l) => l.cryptoId))]
  const cryptoRows = cryptoIds.length
    ? await db.select().from(cryptos).where(inArray(cryptos.id, cryptoIds))
    : []

  const cryptoMap = new Map(cryptoRows.map((c) => [c.id, c]))
  const linkMap   = new Map<string, typeof cryptoRows>()
  for (const link of cryptoLinks) {
    const list = linkMap.get(link.paymentAccountId) ?? []
    const c = cryptoMap.get(link.cryptoId)
    if (c) list.push(c)
    linkMap.set(link.paymentAccountId, list)
  }

  // Banka ilişkileri
  const bankIds = [...new Set(rows.map((r) => r.bankId).filter(Boolean))] as string[]
  const bankRows = bankIds.length
    ? await db.select().from(banks).where(inArray(banks.id, bankIds))
    : []
  const bankMap = new Map(bankRows.map((b) => [b.id, b]))

  return rows.map((r) => ({
    ...r,
    bank:    r.bankId ? (bankMap.get(r.bankId) ?? null) : null,
    cryptos: linkMap.get(r.id) ?? [],
  }))
}

export const paymentAccountService = {

  async createAccount(tenantId: string, data: CreatePaymentAccountInput, ownedByUserId?: string) {
    // Banka kontrolü
    if (data.type === 'bank') {
      const bank = await db.query.banks.findFirst({ where: eq(banks.id, data.bankId), columns: { id: true } })
      if (!bank) throw new AppError('NOT_FOUND', 'Banka bulunamadı.', 404)
    }

    // Kripto kontrolü
    if (data.type === 'crypto') {
      const found = await db.select({ id: cryptos.id }).from(cryptos).where(inArray(cryptos.id, data.cryptoIds))
      if (found.length !== data.cryptoIds.length) throw new AppError('NOT_FOUND', 'Bir veya daha fazla kripto para bulunamadı.', 404)
    }

    const [row] = await db.insert(paymentAccounts).values({
      tenantId,
      type:           data.type,
      bankId:         data.type === 'bank' ? data.bankId : null,
      name:           data.name,
      accountNumber:  data.accountNumber,
      environment:    data.environment,
      dailyLimit:     data.dailyLimit,
      dailyUsed:      '0',
      ownedByUserId:  ownedByUserId ?? null,
    }).returning()
    if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Hesap oluşturulamadı.', 500)

    // Kripto junction kayıtları
    if (data.type === 'crypto' && data.cryptoIds.length > 0) {
      await db.insert(paymentAccountCryptos).values(
        data.cryptoIds.map((cryptoId) => ({ paymentAccountId: row.id, cryptoId }))
      )
    }

    const [enriched] = await attachRelations([row])
    return enriched
  },

  async listAccounts(tenantId: string, filters: { status?: string; type?: string; bankId?: string }, page: number, limit: number) {
    return db.transaction(async (tx) => {
      const conditions = [eq(paymentAccounts.tenantId, tenantId)]
      if (filters.status) conditions.push(eq(paymentAccounts.status, filters.status as 'active' | 'inactive'))
      if (filters.type)   conditions.push(eq(paymentAccounts.type, filters.type as 'bank' | 'crypto'))
      if (filters.bankId) conditions.push(eq(paymentAccounts.bankId, filters.bankId))

      const where = and(...conditions)

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(paymentAccounts)
        .where(where)

      const totalPages = Math.max(1, Math.ceil(count / limit))
      const safePage   = Math.max(1, Math.min(page, totalPages))
      const offset     = (safePage - 1) * limit

      const rows = await tx
        .select()
        .from(paymentAccounts)
        .where(where)
        .orderBy(paymentAccounts.createdAt, paymentAccounts.id)
        .limit(limit)
        .offset(offset)

      const enriched = await attachRelations(rows)
      return { data: enriched, meta: { total: count, page: safePage, limit } }
    })
  },

  async getAccount(tenantId: string, id: string) {
    const row = await db.query.paymentAccounts.findFirst({
      where: and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId)),
    })
    if (!row) throw new AppError('NOT_FOUND', 'Ödeme hesabı bulunamadı.', 404)
    const [enriched] = await attachRelations([row])
    return enriched
  },

  async updateAccount(tenantId: string, id: string, data: UpdatePaymentAccountInput) {
    // Kripto güncellemesi varsa junction table'ı yeniden yaz
    if (data.cryptoIds !== undefined) {
      const found = await db.select({ id: cryptos.id }).from(cryptos).where(inArray(cryptos.id, data.cryptoIds))
      if (found.length !== data.cryptoIds.length) throw new AppError('NOT_FOUND', 'Bir veya daha fazla kripto para bulunamadı.', 404)

      await db.delete(paymentAccountCryptos).where(eq(paymentAccountCryptos.paymentAccountId, id))
      if (data.cryptoIds.length > 0) {
        await db.insert(paymentAccountCryptos).values(
          data.cryptoIds.map((cryptoId) => ({ paymentAccountId: id, cryptoId }))
        )
      }
    }

    const updateFields = {
      ...(data.name          !== undefined && { name: data.name }),
      ...(data.accountNumber !== undefined && { accountNumber: data.accountNumber }),
      ...(data.bankId        !== undefined && { bankId: data.bankId }),
      ...(data.environment   !== undefined && { environment: data.environment }),
      ...(data.dailyLimit    !== undefined && { dailyLimit: data.dailyLimit }),
      updatedAt: new Date(),
    }

    const [updated] = await db.update(paymentAccounts)
      .set(updateFields)
      .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId)))
      .returning()
    if (!updated) throw new AppError('NOT_FOUND', 'Ödeme hesabı bulunamadı.', 404)

    const [enriched] = await attachRelations([updated])
    return enriched
  },

  async updateStatus(tenantId: string, id: string, data: UpdatePaymentAccountStatusInput) {
    const [updated] = await db.update(paymentAccounts)
      .set({ status: data.status, updatedAt: new Date() })
      .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId)))
      .returning()
    if (!updated) throw new AppError('NOT_FOUND', 'Ödeme hesabı bulunamadı.', 404)
    const [enriched] = await attachRelations([updated])
    return enriched
  },

  async updateDailyLimit(tenantId: string, id: string, data: UpdateDailyLimitInput) {
    const existing = await db.query.paymentAccounts.findFirst({
      where: and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId)),
      columns: { dailyUsed: true },
    })
    if (!existing) throw new AppError('NOT_FOUND', 'Ödeme hesabı bulunamadı.', 404)

    if (parseFloat(data.dailyLimit) < parseFloat(existing.dailyUsed)) {
      throw new AppError('INVALID_DAILY_LIMIT', 'Yeni günlük limit mevcut kullanımın altına düşemez.', 409)
    }

    const [updated] = await db.update(paymentAccounts)
      .set({ dailyLimit: data.dailyLimit, updatedAt: new Date() })
      .where(and(eq(paymentAccounts.id, id), eq(paymentAccounts.tenantId, tenantId)))
      .returning()
    if (!updated) throw new AppError('NOT_FOUND', 'Ödeme hesabı bulunamadı.', 404)
    const [enriched] = await attachRelations([updated])
    return enriched
  },
}
