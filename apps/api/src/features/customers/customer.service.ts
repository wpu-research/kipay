import { db, customers, merchants, and, eq, or, ilike, sql, desc } from '@panel/db'
import { AppError } from '../../errors/app-error.js'

export const customerService = {
  async list(params: {
    role: string; callerTenantId?: string; callerMerchantId?: string
    search?: string; merchantId?: string; tenantId?: string; page: number; limit: number
  }) {
    const conds = []

    // Kapsam: merchant sadece kendi; tenant_admin/finans kendi tenant'ı; super_admin serbest
    if (params.role === 'merchant') {
      if (!params.callerMerchantId) throw new AppError('FORBIDDEN', 'Merchant hesabı bir siteye bağlı değil.', 403)
      conds.push(eq(customers.merchantId, params.callerMerchantId))
    } else if (['tenant_admin', 'finans_admin', 'finans_operator'].includes(params.role)) {
      if (!params.callerTenantId) throw new AppError('FORBIDDEN', 'Yetkiniz yok.', 403)
      conds.push(eq(customers.tenantId, params.callerTenantId))
      if (params.merchantId) conds.push(eq(customers.merchantId, params.merchantId))
    } else if (params.role === 'super_admin') {
      if (params.tenantId)   conds.push(eq(customers.tenantId, params.tenantId))
      if (params.merchantId) conds.push(eq(customers.merchantId, params.merchantId))
    } else {
      throw new AppError('FORBIDDEN', 'Yetkiniz yok.', 403)
    }

    if (params.search) {
      const s = `%${params.search}%`
      conds.push(or(
        ilike(customers.firstName, s),
        ilike(customers.lastName, s),
        ilike(customers.phone, s),
        ilike(customers.identityNumber, s),
        ilike(customers.externalUserId, s),
      )!)
    }

    const where = conds.length ? and(...conds) : undefined
    const offset = (params.page - 1) * params.limit

    const [[countRow], rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(customers).where(where),
      db.select({
        id:             customers.id,
        merchantId:     customers.merchantId,
        merchantName:   merchants.merchantName,
        externalUserId: customers.externalUserId,
        identityNumber: customers.identityNumber,
        firstName:      customers.firstName,
        lastName:       customers.lastName,
        phone:          customers.phone,
        depositCount:   customers.depositCount,
        firstSeenAt:    customers.firstSeenAt,
        lastSeenAt:     customers.lastSeenAt,
      })
        .from(customers)
        .innerJoin(merchants, eq(customers.merchantId, merchants.id))
        .where(where)
        .orderBy(desc(customers.lastSeenAt))
        .limit(params.limit).offset(offset),
    ])

    const total = countRow?.count ?? 0
    return {
      data: rows.map(r => ({
        ...r,
        firstSeenAt: r.firstSeenAt.toISOString(),
        lastSeenAt:  r.lastSeenAt.toISOString(),
      })),
      meta: { total, page: params.page, limit: params.limit, totalPages: Math.max(1, Math.ceil(total / params.limit)) },
    }
  },
}
