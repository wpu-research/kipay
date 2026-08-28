import { db, notifications, users, eq, and, inArray } from '@panel/db'
import { AppError } from '../../errors/app-error.js'

export const notificationService = {

  async createPendingNotifications(params: {
    tenantId:      string
    transactionId: string
    payload:       {
      txId:         string
      amount:       string
      currency:     string
      merchantName: string
      createdAt:    string
    }
  }) {
    const { tenantId, transactionId, payload } = params

    // Tenant'taki tüm aktif finans kullanıcılarını bul
    const financeUsers = await db.query.users.findMany({
      where: and(
        eq(users.tenantId, tenantId),
        inArray(users.role, ['finans_admin', 'finans_operator', 'tenant_admin']),
        eq(users.status, 'active'),
      ),
      columns: { id: true },
    })

    if (financeUsers.length === 0) return

    await db.insert(notifications).values(
      financeUsers.map((u) => ({
        tenantId,
        userId:        u.id,
        transactionId,
        type:          'transaction.pending',
        payload:       { type: 'transaction.pending' as const, ...payload },
        isRead:        false,
      }))
    )
  },

  async listNotifications(params: {
    tenantId: string
    userId:   string
    isRead?:  boolean
    page:     number
    limit:    number
  }) {
    const { tenantId, userId, isRead, page, limit } = params
    const offset = (page - 1) * limit

    const conditions = [
      eq(notifications.tenantId, tenantId),
      eq(notifications.userId, userId),
    ]
    if (isRead !== undefined) {
      conditions.push(eq(notifications.isRead, isRead))
    }
    const where = and(...conditions)

    const [rows, countResult] = await Promise.all([
      db.query.notifications.findMany({
        where,
        orderBy: (n, { desc }) => [desc(n.createdAt)],
        limit,
        offset,
      }),
      db.$count(notifications, where),
    ])

    return {
      data: rows,
      meta: { total: countResult, page, limit },
    }
  },

  async markRead(params: {
    tenantId: string
    userId:   string
    id:       string
  }) {
    const { tenantId, userId, id } = params

    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
      ))
      .returning()

    if (!updated) throw new AppError('NOT_FOUND', 'Bildirim bulunamadı.', 404)
    return { success: true }
  },

  async markAllRead(params: {
    tenantId: string
    userId:   string
  }) {
    const { tenantId, userId } = params

    const result = await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        eq(notifications.isRead, false),
      ))
      .returning({ id: notifications.id })

    return { updated: result.length }
  },
}
