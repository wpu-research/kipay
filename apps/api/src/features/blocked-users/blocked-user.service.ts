import { db, users, sessions, eq, and, isNull } from '@panel/db'
import { AppError } from '../../errors/app-error.js'

export const blockedUserService = {

  async blockUser(
    targetUserId: string,
    blockData: { blockedUntil?: Date; permanent?: boolean },
    requesterRole: string,
    requesterTenantId: string,
    requesterId: string,
  ) {
    // 1. Block değerlerini hazırla (erken validasyon — DB'ye gitmeye gerek yok)
    const isPermanentlyBlocked = blockData.permanent === true
    const blockedUntil = isPermanentlyBlocked ? null : (blockData.blockedUntil ?? null)

    if (!isPermanentlyBlocked && !blockedUntil) {
      throw new AppError('VALIDATION_ERROR', 'blockedUntil veya permanent: true gerekli.', 400)
    }

    if (blockedUntil && blockedUntil <= new Date()) {
      throw new AppError('VALIDATION_ERROR', 'blockedUntil gelecekte bir zaman olmalıdır.', 400)
    }

    // 2. Atomik: SELECT FOR UPDATE + policy check + update + session revoke
    // [CR-3 Fix Medium] Policy kontrolü (role/self) transaction içinde FOR UPDATE sonrası yapılır — yarış güvenli
    let targetTenantId = ''

    await db.transaction(async (tx) => {
      const scopeWhere = requesterRole === 'super_admin'
        ? eq(users.id, targetUserId)
        : and(eq(users.id, targetUserId), eq(users.tenantId, requesterTenantId))

      const [target] = await tx.select().from(users).where(scopeWhere).for('update').limit(1)

      if (!target) {
        throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.', 404)
      }

      targetTenantId = target.tenantId

      // Policy checks inside transaction (FOR UPDATE sonrası — yarış güvenli)
      if (target.id === requesterId) {
        throw new AppError('FORBIDDEN', 'Kendinizi engelleyemezsiniz.', 403)
      }
      if (target.role === 'super_admin') {
        throw new AppError('FORBIDDEN', 'super_admin rolündeki kullanıcı engellenemez.', 403)
      }

      // [CR-4 Fix Low] blockedUntil lock bekleme süresi boyunca zaman aşımı olabilir; yeniden kontrol et
      if (blockedUntil && blockedUntil <= new Date()) {
        throw new AppError('VALIDATION_ERROR', 'blockedUntil gelecekte bir zaman olmalıdır.', 400)
      }

      const updateQuery = tx.update(users)
      // @ts-ignore — blockedUntil ve isPermanentlyBlocked users şemasından kaldırıldı (0025 migration), servis güncellenmeli
      const [updated] = await updateQuery.set({ blockedUntil, isPermanentlyBlocked, updatedAt: new Date() })
        .where(eq(users.id, targetUserId))
        .returning({ id: users.id })
      if (!updated) throw new AppError('NOT_FOUND', 'Kullanıcı güncellenemedi (yarışan değişiklik).', 404)

      // Tüm aktif session'ları revoke et
      await tx.update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, targetUserId), isNull(sessions.revokedAt)))
    })

    return { blockedUntil: blockedUntil?.toISOString() ?? null, isPermanentlyBlocked, tenantId: targetTenantId }
  },

  async unblockUser(
    targetUserId: string,
    requesterRole: string,
    requesterTenantId: string,
  ) {
    const whereClause = requesterRole === 'super_admin'
      ? eq(users.id, targetUserId)
      : and(eq(users.id, targetUserId), eq(users.tenantId, requesterTenantId))

    const unblockQuery = db.update(users)
    // @ts-ignore — blockedUntil ve isPermanentlyBlocked users şemasından kaldırıldı (0025 migration), servis güncellenmeli
    const [updated] = await unblockQuery.set({ blockedUntil: null, isPermanentlyBlocked: false, updatedAt: new Date() })
      .where(whereClause)
      .returning({ id: users.id, username: users.username, tenantId: users.tenantId })

    if (!updated) {
      throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.', 404)
    }

    return updated
  },
}
