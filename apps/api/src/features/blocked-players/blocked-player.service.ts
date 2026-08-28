import { db, blockedPlayers, merchants, and, eq, or, gt, lte, isNull, not } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import type { BlockPlayerInput } from '@panel/types'

export const blockedPlayerService = {

  async blockPlayer(tenantId: string, createdBy: string, input: BlockPlayerInput) {
    // 1. Merchant tenant kontrolü
    const merchant = await db.query.merchants.findFirst({
      where: and(eq(merchants.id, input.merchantId), eq(merchants.tenantId, tenantId)),
    })
    if (!merchant) throw new AppError('MERCHANT_NOT_FOUND', 'Merchant bulunamadı.', 404)

    const isPermanent = input.permanent === true
    const blockedUntil = isPermanent ? null
      : input.blockedUntil ? new Date(input.blockedUntil) : null

    if (!isPermanent && !blockedUntil) {
      throw new AppError('VALIDATION_ERROR', 'blockedUntil veya permanent: true gerekli.', 400)
    }
    if (blockedUntil && blockedUntil <= new Date()) {
      throw new AppError('VALIDATION_ERROR', 'blockedUntil gelecekte bir zaman olmalıdır.', 400)
    }

    // Idempotent insert: aynı merchant+player için var olan aktif blokları önce kaldır
    // → unblock olmadan yeni block geldiğinde orphan aktif kayıt kalmaz
    await db.delete(blockedPlayers).where(and(
      eq(blockedPlayers.merchantId, input.merchantId),
      eq(blockedPlayers.externalUserId, input.externalUserId),
      eq(blockedPlayers.tenantId, tenantId),
    ))

    const [inserted] = await db.insert(blockedPlayers).values({
      tenantId, merchantId: input.merchantId, externalUserId: input.externalUserId,
      blockedUntil, isPermanent, createdBy,
    }).returning()

    return inserted
  },

  async unblockPlayer(tenantId: string, blockId: string) {
    const [deleted] = await db.delete(blockedPlayers)
      .where(and(eq(blockedPlayers.id, blockId), eq(blockedPlayers.tenantId, tenantId)))
      .returning()
    if (!deleted) throw new AppError('NOT_FOUND', 'Engel kaydı bulunamadı.', 404)
    return deleted
  },

  async listBlockedPlayers(tenantId: string, opts: {
    merchantId?: string; status?: 'active' | 'expired' | 'all'; page: number; limit: number
  }) {
    const now = new Date()

    // SQL-level filters — status'ı sayfalama öncesinde uygula (in-memory filter hatası düzeltildi)
    const conditions: ReturnType<typeof eq>[] = [eq(blockedPlayers.tenantId, tenantId)]
    if (opts.merchantId) conditions.push(eq(blockedPlayers.merchantId, opts.merchantId))
    if (opts.status === 'active') {
      conditions.push(or(eq(blockedPlayers.isPermanent, true), gt(blockedPlayers.blockedUntil, now))!)
    } else if (opts.status === 'expired') {
      conditions.push(eq(blockedPlayers.isPermanent, false))
      conditions.push(not(isNull(blockedPlayers.blockedUntil)))
      conditions.push(lte(blockedPlayers.blockedUntil, now))
    }
    const where = and(...conditions)

    const [rows, total] = await Promise.all([
      db.query.blockedPlayers.findMany({
        where,
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: opts.limit,
        offset: (opts.page - 1) * opts.limit,
      }),
      db.$count(blockedPlayers, where),
    ])

    const serialized = rows.map(r => ({
      id:             r.id,
      merchantId:     r.merchantId,
      externalUserId: r.externalUserId,
      blockedUntil:   r.blockedUntil?.toISOString() ?? null,
      isPermanent:    r.isPermanent,
      createdBy:      r.createdBy,
      createdAt:      r.createdAt.toISOString(),
    }))
    return { data: serialized, total, page: opts.page, limit: opts.limit }
  },

  // Merchant API entegrasyon noktası — deposit/withdrawal öncesi çağrılır
  async checkPlayerBlocked(merchantId: string, externalUserId: string) {
    const now = new Date()
    const block = await db.query.blockedPlayers.findFirst({
      where: and(
        eq(blockedPlayers.merchantId, merchantId),
        eq(blockedPlayers.externalUserId, externalUserId),
        or(
          eq(blockedPlayers.isPermanent, true),
          gt(blockedPlayers.blockedUntil, now),
        ),
      ),
    })
    if (block) {
      throw new AppError(
        'USER_BLOCKED',
        'Bu oyuncu engellenmiştir.',
        403,
        { blockedUntil: block.blockedUntil?.toISOString() ?? null },
      )
    }
  },
}
