import {
  db,
  transactions,
  callbackLogs,
  merchants,
  and,
  eq,
  gte,
  lte,
  sql,
} from '@panel/db'

// --- Yardımcı: tarih normalizasyonu ---

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const parseFrom = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T00:00:00.000Z') : new Date(v)
const parseTo   = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T23:59:59.999Z') : new Date(v)

// --- Tip tanımları ---

interface TransactionReportParams {
  role:               string
  callerTenantId?:    string
  callerMerchantId?:  string
  // isteğe bağlı filtreler
  tenantId?:          string
  merchantId?:        string

  status?:            string
  from?:              string
  to?:                string
}

// --- Yardımcı: WHERE koşullarını role göre oluştur ---

function buildTransactionConditions(params: TransactionReportParams) {
  const conditions = []

  if (params.role === 'merchant') {
    if (!params.callerMerchantId || !params.callerTenantId) return null
    conditions.push(eq(transactions.merchantId, params.callerMerchantId))
    conditions.push(eq(transactions.tenantId, params.callerTenantId))
  } else if (params.role === 'tenant_admin' || params.role === 'finans_admin' || params.role === 'finans_operator') {
    if (!params.callerTenantId) return null
    conditions.push(eq(transactions.tenantId, params.callerTenantId))
    if (params.merchantId) conditions.push(eq(transactions.merchantId, params.merchantId))
  } else if (params.role === 'super_admin') {
    if (params.tenantId)   conditions.push(eq(transactions.tenantId, params.tenantId))
    if (params.merchantId) conditions.push(eq(transactions.merchantId, params.merchantId))
  } else {
    // Bilinmeyen rol — koşulsuz sorgu engel; null döndür
    return null
  }

  if (params.status) conditions.push(eq(transactions.status, params.status as 'STARTED' | 'PENDING' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'FLAGGED' | 'TIMEOUT' | 'CANCELLED'))
  if (params.from)   conditions.push(gte(transactions.createdAt, parseFrom(params.from)))
  if (params.to)     conditions.push(lte(transactions.createdAt, parseTo(params.to)))

  return conditions
}

// --- Servis ---

export const reportService = {

  async getTransactionReport(params: TransactionReportParams) {
    const conditions = buildTransactionConditions(params)
    if (conditions === null) {
      // Rol için gerekli scope bilgisi eksik — boş yanıt döndür
      return {
        totalAmount:        '0',
        transactionCount:   0,
        averageAmount:      '0',
        currency:           null,
        filters: {
          from: params.from,
          to:   params.to,
        },
        dailyBuckets:       [],
        statusDistribution: [],
      }
    }

    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined

    const aggregateQuery = db.select({
      totalAmount:      sql<string>`COALESCE(SUM(${transactions.amount}), '0')`,
      transactionCount: sql<number>`COUNT(*)::int`,
      averageAmount:    sql<string>`COALESCE(AVG(${transactions.amount})::text, '0')`,
      currency:         sql<string | null>`CASE WHEN COUNT(DISTINCT ${transactions.currency}) = 1 THEN MIN(${transactions.currency}) ELSE NULL END`,
    })
    .from(transactions)
    .where(baseWhere)

    // Günlük bucket sorgusu
    const dailyQuery = db.select({
      date:        sql<string>`DATE_TRUNC('day', ${transactions.createdAt})::date::text`,
      count:       sql<number>`COUNT(*)::int`,
      totalAmount: sql<string>`COALESCE(SUM(${transactions.amount}), '0')`,
    })
    .from(transactions)
    .where(baseWhere)
    .groupBy(sql`DATE_TRUNC('day', ${transactions.createdAt})`)
    .orderBy(sql`DATE_TRUNC('day', ${transactions.createdAt})`)

    // Status dağılımı
    const statusQuery = db.select({
      status: transactions.status,
      count:  sql<number>`COUNT(*)::int`,
    })
    .from(transactions)
    .where(baseWhere)
    .groupBy(transactions.status)

    const [[result], dailyBuckets, statusDistribution] = await Promise.all([
      aggregateQuery,
      dailyQuery,
      statusQuery,
    ])

    return {
      totalAmount:        result?.totalAmount      ?? '0',
      transactionCount:   result?.transactionCount ?? 0,
      averageAmount:      result?.averageAmount     ?? '0',
      currency:           result?.currency          ?? null,
      dailyBuckets:       dailyBuckets.map(r => ({ date: r.date, count: r.count, totalAmount: r.totalAmount })),
      statusDistribution: statusDistribution.map(r => ({ status: r.status, count: r.count })),
      filters: {
        from: params.from,
        to:   params.to,
      },
    }
  },


  async getMerchantDailyReport(params: {
    role:             string
    callerTenantId?:  string
    tenantId?:        string
    from?:            string
    to?:              string
  }) {
    const conditions = []

    if (params.role === 'super_admin') {
      if (params.tenantId) conditions.push(eq(transactions.tenantId, params.tenantId))
    } else if (params.role === 'tenant_admin') {
      if (!params.callerTenantId) return []
      conditions.push(eq(transactions.tenantId, params.callerTenantId))
    } else {
      return []
    }

    conditions.push(eq(transactions.status, 'COMPLETED'))

    if (params.from) conditions.push(gte(transactions.createdAt, parseFrom(params.from)))
    if (params.to)   conditions.push(lte(transactions.createdAt, parseTo(params.to)))

    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined

    return db
      .select({
        date:         sql<string>`DATE_TRUNC('day', ${transactions.createdAt})::date::text`,
        merchantId:   merchants.id,
        merchantName: merchants.merchantName,
        count:        sql<number>`COUNT(*)::int`,
        totalAmountTry: sql<string>`COALESCE(SUM(${transactions.amountTry}), '0')::text`,
      })
      .from(transactions)
      .innerJoin(merchants, eq(transactions.merchantId, merchants.id))
      .where(baseWhere)
      .groupBy(sql`DATE_TRUNC('day', ${transactions.createdAt})`, merchants.id, merchants.merchantName)
      .orderBy(sql`DATE_TRUNC('day', ${transactions.createdAt}) DESC`, merchants.merchantName)
  },

  async getCallbackReport(tenantId?: string) {
    // Callback başarı oranı
    const callbackWhere = tenantId
      ? eq(transactions.tenantId, tenantId)
      : undefined

    const [callbackStats] = await db
      .select({
        totalCallbacks: sql<number>`COUNT(*)::int`,
        successCount:   sql<number>`COUNT(CASE WHEN ${callbackLogs.success} THEN 1 END)::int`,
      })
      .from(callbackLogs)
      .leftJoin(transactions, eq(callbackLogs.transactionId, transactions.id))
      .where(callbackWhere)

    // Dead-letter sayısı
    const deadLetterWhere = tenantId
      ? and(eq(transactions.callbackStatus, 'dead'), eq(transactions.tenantId, tenantId))
      : eq(transactions.callbackStatus, 'dead')

    const [deadLetterStats] = await db
      .select({
        deadLetterCount: sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .where(deadLetterWhere)

    // Ortalama deneme sayısı (başarısız callbacklar için)
    const avgAttemptsWhere = tenantId
      ? and(eq(callbackLogs.success, false), eq(transactions.tenantId, tenantId))
      : eq(callbackLogs.success, false)

    const [avgAttempts] = await db
      .select({
        avgAttemptCount: sql<number | null>`AVG(max_attempts)::numeric(10,2)`,
      })
      .from(
        db.select({
          max_attempts: sql<number>`MAX(${callbackLogs.attemptNumber})`,
        })
        .from(callbackLogs)
        .leftJoin(transactions, eq(callbackLogs.transactionId, transactions.id))
        .where(avgAttemptsWhere)
        .groupBy(callbackLogs.transactionId)
        .as('sub')
      )

    const total    = callbackStats?.totalCallbacks ?? 0
    const success  = callbackStats?.successCount   ?? 0

    return {
      successRate:     total > 0 ? success / total : 0,
      avgAttemptCount: avgAttempts?.avgAttemptCount ? Number(avgAttempts.avgAttemptCount) : null,
      deadLetterCount: deadLetterStats?.deadLetterCount ?? 0,
    }
  },
}
