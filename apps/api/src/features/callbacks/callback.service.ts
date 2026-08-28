import { createHmac } from 'node:crypto'
import { db, transactions, callbackLogs, merchants, eq, sql, and, gte, lte, desc, count } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import { PgBoss } from 'pg-boss'

export const callbackService = {
  async retryCallback(boss: InstanceType<typeof PgBoss>, tenantId: string, txId: string): Promise<{ jobId: string }> {
    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, txId),
    })
    if (!tx || tx.tenantId !== tenantId) {
      throw new AppError('TRANSACTION_NOT_FOUND', 'İşlem bulunamadı veya erişim yetkiniz yok', 404)
    }

    // Yalnızca başarısız callbacklar retry-eligible; worker'a uygunsuz transaction gitmez
    if (tx.callbackStatus !== 'failed' && tx.callbackStatus !== 'dead') {
      throw new AppError(
        'INVALID_CALLBACK_STATE',
        `Callback yalnızca 'failed' veya 'dead' durumundaki işlemler için yeniden tetiklenebilir. Mevcut durum: ${tx.callbackStatus ?? 'none'}`,
        409,
      )
    }

    const jobId = await boss.send('callback-retry', { transactionId: txId }, {
      retryLimit:      4,
      retryDelay:      120,
      singletonKey:    txId,
      expireInSeconds: 60,
    })

    return { jobId: jobId ?? 'queued' }
  },

  async listCallbackLogs(tenantId: string, txId: string) {
    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, txId),
    })
    if (!tx || tx.tenantId !== tenantId) {
      throw new AppError('TRANSACTION_NOT_FOUND', 'İşlem bulunamadı veya erişim yetkiniz yok', 404)
    }

    const logs = await db.query.callbackLogs.findMany({
      where: eq(callbackLogs.transactionId, txId),
      orderBy: (t, { asc }) => [asc(t.attemptNumber)],
    })

    return logs.map(log => ({
      ...log,
      sentAt: log.sentAt.toISOString(),
    }))
  },

  async getCallbackStatusSummary(tenantId: string | null) {
    const rows = await db
      .select({
        callbackStatus: transactions.callbackStatus,
        count:          sql<number>`COUNT(*)::int`,
      })
      .from(transactions)
      .where(
        sql`${transactions.callbackStatus} IS NOT NULL${tenantId ? sql` AND ${transactions.tenantId} = ${tenantId}` : sql``}`
      )
      .groupBy(transactions.callbackStatus)

    const summary: Record<string, number> = {}
    for (const r of rows) {
      summary[r.callbackStatus ?? 'null'] = r.count
    }
    return {
      pending: summary['pending'] ?? 0,
      sent:    summary['sent']    ?? 0,
      failed:  summary['failed']  ?? 0,
      dead:    summary['dead']    ?? 0,
    }
  },

  async listAllCallbackLogs(opts: {
    tenantId:      string | null  // null = super_admin (tümü)
    page:          number
    limit:         number
    success?:      boolean
    from?:         string
    to?:           string
    transactionId?: string
    merchantId?:   string
  }) {
    const { tenantId, page, limit, success, from, to, transactionId, merchantId } = opts
    const offset = (page - 1) * limit

    const conditions = and(
      tenantId      ? eq(transactions.tenantId, tenantId)                         : undefined,
      success !== undefined ? eq(callbackLogs.success, success)                   : undefined,
      from          ? gte(callbackLogs.sentAt, new Date(from))                    : undefined,
      to            ? lte(callbackLogs.sentAt, new Date(to))                      : undefined,
      transactionId ? eq(callbackLogs.transactionId, transactionId)               : undefined,
      merchantId    ? eq(transactions.merchantId, merchantId)                     : undefined,
    )

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id:             callbackLogs.id,
          transactionId:  callbackLogs.transactionId,
          attemptNumber:  callbackLogs.attemptNumber,
          sentAt:         callbackLogs.sentAt,
          responseStatus: callbackLogs.responseStatus,
          responseBody:   callbackLogs.responseBody,
          success:        callbackLogs.success,
          errorMessage:   callbackLogs.errorMessage,
          merchantId:     transactions.merchantId,
          merchantName:   merchants.merchantName,
          txStatus:       transactions.status,
          txAmount:       transactions.amount,
          txCurrency:     transactions.currency,
        })
        .from(callbackLogs)
        .innerJoin(transactions, eq(callbackLogs.transactionId, transactions.id))
        .leftJoin(merchants, eq(transactions.merchantId, merchants.id))
        .where(conditions)
        .orderBy(desc(callbackLogs.sentAt))
        .limit(limit)
        .offset(offset),

      db
        .select({ total: count() })
        .from(callbackLogs)
        .innerJoin(transactions, eq(callbackLogs.transactionId, transactions.id))
        .where(conditions),
    ])

    return {
      data: rows.map(r => ({
        ...r,
        sentAt: r.sentAt.toISOString(),
      })),
      meta: {
        total:      total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    }
  },

  async simulateCallback(merchantId: string, txId: string, status: 'COMPLETED' | 'REJECTED' | 'TIMEOUT'): Promise<{ success: boolean; attemptId: string }> {
    // 1. Merchant yükle ve sandbox kontrolü
    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.id, merchantId),
    })
    if (!merchant) {
      throw new AppError('TRANSACTION_NOT_FOUND', 'Merchant bulunamadı', 404)
    }
    if (!merchant.isSandbox) {
      throw new AppError('SANDBOX_ONLY', 'Bu endpoint yalnızca sandbox merchant\'lar için geçerlidir', 403)
    }

    // 2. Transaction yükle ve merchant sahipliği kontrolü
    const tx = await db.query.transactions.findFirst({
      where: eq(transactions.id, txId),
    })
    if (!tx || tx.merchantId !== merchantId) {
      throw new AppError('TRANSACTION_NOT_FOUND', 'İşlem bulunamadı veya erişim yetkiniz yok', 404)
    }

    // 3. webhookUrl ve callbackSecret kontrolü
    if (!merchant.webhookUrl || !merchant.callbackSecret) {
      throw new AppError('MISSING_WEBHOOK_CONFIG', 'webhookUrl veya callbackSecret yapılandırılmamış', 400)
    }

    // 4. Payload oluştur — signature hariç
    const timestamp = new Date().toISOString()
    const payloadWithoutSig = {
      txId:           tx.id,
      status,
      type:           tx.type,
      amount:         tx.amount,
      currency:       tx.currency,
      externalUserId: tx.externalUserId,
      timestamp,
    }
    const rawBodyWithoutSig = JSON.stringify(payloadWithoutSig)

    // 5. HMAC imzası
    const hmacHex  = createHmac('sha256', merchant.callbackSecret).update(rawBodyWithoutSig).digest('hex')
    const signature = `sha256=${hmacHex}`
    const finalPayload = { ...payloadWithoutSig, signature }
    const rawBody = JSON.stringify(finalPayload)

    // 7. HTTP POST — 10 saniye timeout
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10_000)

    let responseStatus: number | null = null
    let responseBody:   string | null = null
    let success        = false
    let errorMessage:  string | null = null

    try {
      const response = await fetch(merchant.webhookUrl, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature':  signature,
        },
        body:   rawBody,
        signal: controller.signal,
      })

      responseStatus = response.status
      const raw      = await response.text()
      responseBody   = raw.slice(0, 500)
      success        = response.ok
    } catch (err: any) {
      errorMessage = err.name === 'AbortError'
        ? 'HTTP timeout (10s)'
        : (err.message ?? 'Network error')
    } finally {
      clearTimeout(timeoutId)
    }

    // 8. Log yaz — attemptNumber atomik subquery ile hesaplanır (race condition önlenir)
    const [inserted] = await db.insert(callbackLogs).values({
      transactionId: txId,
      attemptNumber: sql<number>`(SELECT COALESCE(MAX(attempt_number), 0) + 1 FROM callback_logs WHERE transaction_id = ${txId})`,
      sentAt:        new Date(),
      responseStatus,
      responseBody,
      success,
      errorMessage,
    }).returning()

    return { success, attemptId: inserted.id }
  },
}
