import {
  db, transactions, merchants, merchantCommissionRates, dailySettlements,
  and, eq, gte, lte, sql,
} from '@panel/db'
import { AppError } from '../../errors/app-error.js'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const parseFrom = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T00:00:00.000Z') : new Date(v)
const parseTo   = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T23:59:59.999Z') : new Date(v)

/** İşlemin yöntemi — commission.ts:resolveMethod ile aynı mantık (SQL karşılığı). */
const methodExpr = sql<string>`
  CASE
    WHEN ${transactions.type} = 'deposit'
      THEN COALESCE(${transactions.depositMethod}, 'havale')
    ELSE CASE
      WHEN LOWER(COALESCE(${transactions.paymentMethod}, '')) IN ('', 'iban') THEN 'havale'
      ELSE LOWER(${transactions.paymentMethod})
    END
  END`

/** Rapor + oran/mutabakat erişiminde tenant kapsamı. super_admin serbest, tenant_admin/finans_admin kendi tenant'ı. */
function scopeTenant(role: string, callerTenantId?: string, wantTenantId?: string): string | undefined | null {
  if (role === 'super_admin') return wantTenantId  // undefined = tüm tenant'lar
  if (['tenant_admin', 'finans_admin'].includes(role)) {
    if (!callerTenantId) return null  // yetkisiz
    return callerTenantId
  }
  return null
}

export const commissionService = {
  async getReport(params: {
    role: string; callerTenantId?: string; callerMerchantId?: string
    tenantId?: string; merchantId?: string; from?: string; to?: string
  }) {
    // Merchant rolü: yalnızca kendi merchant'ı
    if (params.role === 'merchant') {
      if (!params.callerMerchantId) throw new AppError('FORBIDDEN', 'Merchant hesabı bir siteye bağlı değil.', 403)
      params = { ...params, merchantId: params.callerMerchantId, tenantId: params.callerTenantId }
    }
    const tenantScope = params.role === 'merchant'
      ? params.callerTenantId
      : scopeTenant(params.role, params.callerTenantId, params.tenantId)
    if (tenantScope === null) throw new AppError('FORBIDDEN', 'Bu rapora erişim yetkiniz yok.', 403)

    const conds = [sql`${transactions.status} IN ('APPROVED', 'COMPLETED')`]
    if (tenantScope)        conds.push(eq(transactions.tenantId, tenantScope))
    if (params.merchantId)  conds.push(eq(transactions.merchantId, params.merchantId))
    if (params.from)        conds.push(gte(transactions.createdAt, parseFrom(params.from)))
    if (params.to)          conds.push(lte(transactions.createdAt, parseTo(params.to)))
    const where = and(...conds)

    const data = await db
      .select({
        date:         sql<string>`DATE_TRUNC('day', ${transactions.createdAt})::date::text`,
        merchantId:   merchants.id,
        merchantName: merchants.merchantName,
        method:       methodExpr,
        depositAmount:        sql<string>`COALESCE(SUM(${transactions.amountTry}) FILTER (WHERE ${transactions.type} = 'deposit'), 0)::text`,
        depositCommission:    sql<string>`COALESCE(SUM(${transactions.commissionAmount}) FILTER (WHERE ${transactions.type} = 'deposit'), 0)::text`,
        withdrawalAmount:     sql<string>`COALESCE(SUM(${transactions.amountTry}) FILTER (WHERE ${transactions.type} = 'withdrawal'), 0)::text`,
        withdrawalCommission: sql<string>`COALESCE(SUM(${transactions.commissionAmount}) FILTER (WHERE ${transactions.type} = 'withdrawal'), 0)::text`,
      })
      .from(transactions)
      .innerJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(where)
      .groupBy(sql`DATE_TRUNC('day', ${transactions.createdAt})`, merchants.id, merchants.merchantName, methodExpr)
      .orderBy(sql`DATE_TRUNC('day', ${transactions.createdAt}) DESC`, merchants.merchantName)

    // İlgili mutabakat kayıtları (elle girilen "bize ödenen / bizim ödediğimiz")
    const sConds = []
    if (tenantScope)       sConds.push(eq(dailySettlements.tenantId, tenantScope))
    if (params.merchantId) sConds.push(eq(dailySettlements.merchantId, params.merchantId))
    if (params.from)       sConds.push(gte(dailySettlements.settlementDate, params.from))
    if (params.to)         sConds.push(lte(dailySettlements.settlementDate, params.to))

    const settlements = await db
      .select({
        merchantId:     dailySettlements.merchantId,
        settlementDate: dailySettlements.settlementDate,
        paidToUs:       dailySettlements.paidToUs,
        paidByUs:       dailySettlements.paidByUs,
        note:           dailySettlements.note,
      })
      .from(dailySettlements)
      .where(sConds.length ? and(...sConds) : undefined)
      .orderBy(sql`${dailySettlements.settlementDate} DESC`)

    return { data, settlements }
  },

  async listRates(params: { role: string; callerTenantId?: string; merchantId?: string }) {
    const tenantScope = scopeTenant(params.role, params.callerTenantId, undefined)
    if (tenantScope === null) throw new AppError('FORBIDDEN', 'Yetkiniz yok.', 403)
    const conds = []
    if (tenantScope)       conds.push(eq(merchantCommissionRates.tenantId, tenantScope))
    if (params.merchantId) conds.push(eq(merchantCommissionRates.merchantId, params.merchantId))
    return db.select({
      id:             merchantCommissionRates.id,
      merchantId:     merchantCommissionRates.merchantId,
      paymentMethod:  merchantCommissionRates.paymentMethod,
      depositRate:    merchantCommissionRates.depositRate,
      withdrawalRate: merchantCommissionRates.withdrawalRate,
    }).from(merchantCommissionRates).where(conds.length ? and(...conds) : undefined)
  },

  async upsertRate(params: {
    role: string; callerTenantId?: string
    merchantId: string; paymentMethod: string; depositRate: number; withdrawalRate: number
  }) {
    // Merchant'ın tenant'ını bul, yetki + tenantId doğrula
    const merchant = await db.query.merchants.findFirst({ where: eq(merchants.id, params.merchantId) })
    if (!merchant) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
    if (params.role !== 'super_admin' && merchant.tenantId !== params.callerTenantId) {
      throw new AppError('FORBIDDEN', 'Bu merchant üzerinde yetkiniz yok.', 403)
    }

    const [row] = await db.insert(merchantCommissionRates).values({
      tenantId:       merchant.tenantId,
      merchantId:     params.merchantId,
      paymentMethod:  params.paymentMethod,
      depositRate:    params.depositRate.toFixed(2),
      withdrawalRate: params.withdrawalRate.toFixed(2),
    }).onConflictDoUpdate({
      target: [merchantCommissionRates.merchantId, merchantCommissionRates.paymentMethod],
      set: {
        depositRate:    params.depositRate.toFixed(2),
        withdrawalRate: params.withdrawalRate.toFixed(2),
        updatedAt:      new Date(),
      },
    }).returning()
    return row
  },

  async listSettlements(params: { role: string; callerTenantId?: string; merchantId?: string; from?: string; to?: string }) {
    const tenantScope = scopeTenant(params.role, params.callerTenantId, undefined)
    if (tenantScope === null) throw new AppError('FORBIDDEN', 'Yetkiniz yok.', 403)
    const conds = []
    if (tenantScope)       conds.push(eq(dailySettlements.tenantId, tenantScope))
    if (params.merchantId) conds.push(eq(dailySettlements.merchantId, params.merchantId))
    if (params.from)       conds.push(gte(dailySettlements.settlementDate, params.from))
    if (params.to)         conds.push(lte(dailySettlements.settlementDate, params.to))
    return db.select({
      merchantId:     dailySettlements.merchantId,
      settlementDate: dailySettlements.settlementDate,
      paidToUs:       dailySettlements.paidToUs,
      paidByUs:       dailySettlements.paidByUs,
      note:           dailySettlements.note,
    }).from(dailySettlements).where(conds.length ? and(...conds) : undefined)
      .orderBy(sql`${dailySettlements.settlementDate} DESC`)
  },

  async upsertSettlement(params: {
    role: string; callerTenantId?: string; userId: string
    merchantId: string; settlementDate: string; paidToUs: number; paidByUs: number; note?: string
  }) {
    const merchant = await db.query.merchants.findFirst({ where: eq(merchants.id, params.merchantId) })
    if (!merchant) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)
    if (params.role !== 'super_admin' && merchant.tenantId !== params.callerTenantId) {
      throw new AppError('FORBIDDEN', 'Bu merchant üzerinde yetkiniz yok.', 403)
    }

    const [row] = await db.insert(dailySettlements).values({
      tenantId:       merchant.tenantId,
      merchantId:     params.merchantId,
      settlementDate: params.settlementDate,
      paidToUs:       params.paidToUs.toFixed(2),
      paidByUs:       params.paidByUs.toFixed(2),
      note:           params.note ?? null,
      createdBy:      params.userId,
    }).onConflictDoUpdate({
      target: [dailySettlements.merchantId, dailySettlements.settlementDate],
      set: {
        paidToUs:  params.paidToUs.toFixed(2),
        paidByUs:  params.paidByUs.toFixed(2),
        note:      params.note ?? null,
        updatedAt: new Date(),
      },
    }).returning()
    return row
  },
}
