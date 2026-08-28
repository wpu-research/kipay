import { db, warningRules, warnings, users, notifications, transactions, merchants,
         and, eq, gte, inArray, count } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import type { CreateWarningRuleInput } from '@panel/types'

export const warningService = {

  async createRule(tenantId: string, createdBy: string, input: CreateWarningRuleInput) {
    // windowMinutes zorunlu: frequency ve repeat_rejection kurallarında
    if (
      (input.ruleType === 'transaction_frequency' || input.ruleType === 'repeat_rejection')
      && !input.windowMinutes
    ) {
      throw new AppError('VALIDATION_ERROR', 'windowMinutes bu kural tipi için zorunludur.', 400)
    }

    // merchantId verilmişse tenant sahipliğini doğrula (cross-tenant kural oluşturma engellenir)
    if (input.merchantId) {
      const merchant = await db.query.merchants.findFirst({
        where: and(eq(merchants.id, input.merchantId), eq(merchants.tenantId, tenantId)),
        columns: { id: true },
      })
      if (!merchant) throw new AppError('MERCHANT_NOT_FOUND', 'Merchant bulunamadı veya erişim yetkiniz yok.', 403)
    }

    const [rule] = await db.insert(warningRules).values({
      tenantId,
      merchantId: input.merchantId ?? null,
      ruleType: input.ruleType,
      threshold: String(input.threshold),
      windowMinutes: input.windowMinutes ?? null,
      isActive: true,
      createdBy,
    }).returning()
    return serializeRule(rule)
  },

  async updateStatus(tenantId: string, ruleId: string, isActive: boolean) {
    const [updated] = await db.update(warningRules)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(warningRules.id, ruleId), eq(warningRules.tenantId, tenantId)))
      .returning()
    if (!updated) throw new AppError('NOT_FOUND', 'Kural bulunamadı.', 404)
    return serializeRule(updated)
  },

  async listRules(tenantId: string, opts: { page: number; limit: number }) {
    const [totalResult] = await db
      .select({ count: count() })
      .from(warningRules)
      .where(eq(warningRules.tenantId, tenantId))
    const data = await db.query.warningRules.findMany({
      where: eq(warningRules.tenantId, tenantId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: opts.limit,
      offset: (opts.page - 1) * opts.limit,
    })
    return {
      data: data.map(serializeRule),
      meta: { total: Number(totalResult.count), page: opts.page, limit: opts.limit },
    }
  },

  async acknowledgeWarning(tenantId: string, warningId: string, userId: string) {
    const [updated] = await db.update(warnings)
      .set({ status: 'acknowledged', acknowledgedBy: userId, acknowledgedAt: new Date() })
      .where(and(
        eq(warnings.id, warningId),
        eq(warnings.tenantId, tenantId),
        eq(warnings.status, 'open'),
      ))
      .returning()
    if (!updated) throw new AppError('NOT_FOUND', 'Uyarı bulunamadı veya zaten kapatılmış.', 404)
    return serializeWarning(updated)
  },

  async listWarnings(tenantId: string, opts: {
    status?: 'open' | 'acknowledged' | 'all'
    ruleType?: string
    page: number
    limit: number
  }) {
    const conditions = [eq(warnings.tenantId, tenantId)]
    if (opts.status && opts.status !== 'all') {
      conditions.push(eq(warnings.status, opts.status))
    }
    if (opts.ruleType) {
      const ruleIds = await db.query.warningRules.findMany({
        where: and(eq(warningRules.tenantId, tenantId), eq(warningRules.ruleType, opts.ruleType)),
        columns: { id: true },
      })
      const ids = ruleIds.map(r => r.id)
      if (ids.length === 0) return { data: [], meta: { total: 0, page: opts.page, limit: opts.limit } }
      conditions.push(inArray(warnings.ruleId, ids))
    }

    const whereClause = and(...conditions)
    const [totalResult] = await db
      .select({ count: count() })
      .from(warnings)
      .where(whereClause)
    const data = await db.query.warnings.findMany({
      where: whereClause,
      orderBy: (t, { desc }) => [desc(t.triggeredAt)],
      limit: opts.limit,
      offset: (opts.page - 1) * opts.limit,
    })
    return {
      data: data.map(serializeWarning),
      meta: { total: Number(totalResult.count), page: opts.page, limit: opts.limit },
    }
  },

  // transaction.service.ts'ten çağrılır — COMPLETED veya REJECTED sonrası
  async evaluateRules(params: {
    tenantId: string
    merchantId: string
    transactionId: string
    amount: string
    newStatus: 'COMPLETED' | 'REJECTED'
  }) {
    const activeRules = await db.query.warningRules.findMany({
      where: and(
        eq(warningRules.tenantId, params.tenantId),
        eq(warningRules.isActive, true),
      ),
    })
    if (activeRules.length === 0) return

    const now = new Date()
    const triggeredWarnings: { ruleId: string; metadata: Record<string, unknown> }[] = []

    for (const rule of activeRules) {
      // Kapsam kontrolü: merchantId varsa sadece o merchant için değerlendir
      if (rule.merchantId && rule.merchantId !== params.merchantId) continue

      const windowStart = rule.windowMinutes
        ? new Date(now.getTime() - rule.windowMinutes * 60_000)
        : null

      if (rule.ruleType === 'amount_threshold') {
        const amount = Number(params.amount)
        const threshold = Number(rule.threshold)
        if (amount >= threshold) {
          triggeredWarnings.push({
            ruleId: rule.id,
            metadata: { ruleType: rule.ruleType, threshold: rule.threshold, actualValue: params.amount },
          })
        }
      }

      if (rule.ruleType === 'transaction_frequency' && windowStart) {
        const [result] = await db
          .select({ count: count() })
          .from(transactions)
          .where(and(
            eq(transactions.merchantId, params.merchantId),
            gte(transactions.createdAt, windowStart),
          ))
        const txCount = Number(result.count)
        if (txCount >= Number(rule.threshold)) {
          triggeredWarnings.push({
            ruleId: rule.id,
            metadata: {
              ruleType: rule.ruleType,
              threshold: rule.threshold,
              actualValue: txCount,
              windowMinutes: rule.windowMinutes,
            },
          })
        }
      }

      if (rule.ruleType === 'repeat_rejection' && windowStart && params.newStatus === 'REJECTED') {
        const [result] = await db
          .select({ count: count() })
          .from(transactions)
          .where(and(
            eq(transactions.merchantId, params.merchantId),
            eq(transactions.status, 'REJECTED'),
            gte(transactions.updatedAt, windowStart),
          ))
        const rejCount = Number(result.count)
        if (rejCount >= Number(rule.threshold)) {
          triggeredWarnings.push({
            ruleId: rule.id,
            metadata: {
              ruleType: rule.ruleType,
              threshold: rule.threshold,
              actualValue: rejCount,
              windowMinutes: rule.windowMinutes,
            },
          })
        }
      }
    }

    if (triggeredWarnings.length === 0) return

    // Warning kayıtlarını oluştur
    const insertedWarnings = await db.insert(warnings).values(
      triggeredWarnings.map(w => ({
        tenantId: params.tenantId,
        ruleId: w.ruleId,
        transactionId: params.transactionId,
        status: 'open' as const,
        metadata: w.metadata,
      }))
    ).returning()

    // Tenant'ın firma/super_admin kullanıcılarına bildirim gönder
    const targetUsers = await db.query.users.findMany({
      where: and(
        eq(users.tenantId, params.tenantId),
        eq(users.status, 'active'),
        inArray(users.role, ['tenant_admin', 'super_admin']),
      ),
      columns: { id: true },
    })

    if (targetUsers.length > 0) {
      const notifValues = insertedWarnings.flatMap(w =>
        targetUsers.map(u => ({
          tenantId: params.tenantId,
          userId: u.id,
          transactionId: params.transactionId,
          type: 'warning' as const,
          payload: { warningId: w.id, ruleId: w.ruleId },
        }))
      )
      await db.insert(notifications).values(notifValues)
    }
  },
}

function serializeRule(rule: typeof warningRules.$inferSelect) {
  return {
    ...rule,
    createdAt:  rule.createdAt.toISOString(),
    updatedAt:  rule.updatedAt.toISOString(),
  }
}

function serializeWarning(warning: typeof warnings.$inferSelect) {
  return {
    ...warning,
    triggeredAt:    warning.triggeredAt.toISOString(),
    acknowledgedAt: warning.acknowledgedAt?.toISOString() ?? null,
    createdAt:      warning.createdAt.toISOString(),
  }
}
