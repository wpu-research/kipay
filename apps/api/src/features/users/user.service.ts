import { db, users, sessions, tenants, merchants, eq, and, isNull, sql, ne } from '@panel/db'
import * as argon2 from 'argon2'
import { AppError } from '../../errors/app-error.js'
import type { CreateUserInput } from '@panel/types'

export const userService = {

  async createUser(
    data: CreateUserInput,
    requesterRole: string,
    requesterTenantId: string,
  ) {
    // 1. Tenant ID belirleme
    let tenantId: string

    if (data.role === 'merchant') {
      // Merchant rolü: tenantId merchant'tan türetilir, ayrıca belirtilmesi gerekmez
      if (!data.merchantId) throw new AppError('VALIDATION_ERROR', 'Merchant rolü için merchantId zorunludur.', 422)
      const [merchant] = await db.select({ tenantId: merchants.tenantId })
        .from(merchants)
        .where(eq(merchants.id, data.merchantId))
        .limit(1)
      if (!merchant) throw new AppError('NOT_FOUND', 'Belirtilen merchant bulunamadı.', 404)
      tenantId = merchant.tenantId
    } else {
      tenantId = requesterRole === 'super_admin'
        ? (data.tenantId ?? requesterTenantId)
        : requesterTenantId

      // Tenant status doğrulaması — super_admin cross-tenant akışı
      if (requesterRole === 'super_admin' && tenantId !== requesterTenantId) {
        const [targetTenant] = await db.select({ status: tenants.status })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1)
        if (!targetTenant) throw new AppError('NOT_FOUND', 'Belirtilen tenant bulunamadı.', 404)
        if (targetTenant.status !== 'active') throw new AppError('TENANT_INACTIVE', 'Pasif tenant için kullanıcı oluşturulamaz.', 422)
      }
    }

    // 2. Rol kısıtlaması
    if (data.role === 'super_admin') {
      throw new AppError('FORBIDDEN', 'super_admin rolü atama yetkiniz yok.', 403)
    }
    if (requesterRole === 'tenant_admin' && !['finans_admin', 'finans_operator', 'merchant'].includes(data.role)) {
      throw new AppError('FORBIDDEN', 'Bu rolü atama yetkiniz yok.', 403)
    }

    // 3. Şifre hash
    const passwordHash = await argon2.hash(data.password)

    // 4. Kullanıcı oluştur
    let user: typeof users.$inferSelect
    try {
      const [inserted] = await db.insert(users).values({
        username:     data.username,
        passwordHash,
        role:         data.role as 'tenant_admin' | 'finans_admin' | 'finans_operator' | 'merchant',
        tenantId,
        merchantId:   data.merchantId ?? null,
      }).returning()
      if (!inserted) throw new AppError('INTERNAL_ERROR', 'Kullanıcı oluşturulamadı.', 500)
      user = inserted
    } catch (err) {
      if (
        (err as { code?: string }).code === '23505' &&
        (err as { constraint?: string }).constraint === 'users_username_unique'
      ) {
        throw new AppError('USER_EXISTS', `'${data.username}' kullanıcı adı zaten kullanımda.`, 409)
      }
      if ((err as { code?: string }).code === '23503') {
        throw new AppError('NOT_FOUND', 'Belirtilen tenant veya merchant bulunamadı.', 404)
      }
      if (err instanceof AppError) throw err
      throw new AppError('INTERNAL_ERROR', 'Kullanıcı oluşturulamadı.', 500)
    }

    return user
  },

  async updateUserStatus(
    id: string,
    status: 'active' | 'inactive',
    requesterRole: string,
    requesterTenantId: string,
  ) {
    // super_admin / tenant_admin akışı
    const whereClause = requesterRole === 'super_admin'
      ? eq(users.id, id)
      : and(eq(users.id, id), eq(users.tenantId, requesterTenantId))

    if (status === 'inactive') {
      return await db.transaction(async (tx) => {
        const [updated] = await tx.update(users)
          .set({ status, updatedAt: new Date() })
          .where(whereClause)
          .returning()

        if (!updated) {
          throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.', 404)
        }

        await tx.update(sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)))

        return updated
      })
    }

    const [updated] = await db.update(users)
      .set({ status, updatedAt: new Date() })
      .where(whereClause)
      .returning()

    if (!updated) {
      throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.', 404)
    }

    return updated
  },

  async deleteUser(
    id: string,
    requesterRole: string,
    requesterTenantId: string,
  ) {
    const whereClause = requesterRole === 'super_admin'
      ? eq(users.id, id)
      : and(eq(users.id, id), eq(users.tenantId, requesterTenantId))

    const [deleted] = await db.delete(users).where(whereClause).returning()
    if (!deleted) throw new AppError('NOT_FOUND', 'Kullanıcı bulunamadı.', 404)
    return deleted
  },

  async getUsers(tenantId: string | undefined, page: number, limit: number) {
    const excludeAdmin = ne(users.role, 'super_admin')
    const whereClause = tenantId
      ? and(eq(users.tenantId, tenantId), excludeAdmin)
      : excludeAdmin

    const result = await db.transaction(async (tx) => {
      const countQuery = tx
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
      if (whereClause) countQuery.where(whereClause)
      const [{ count }] = await countQuery

      const clamped = Math.max(1, Math.min(page, count === 0 ? 1 : Math.ceil(count / limit)))
      const clampedOffset = (clamped - 1) * limit

      const dataQuery = tx
        .select({
          id:                   users.id,
          username:             users.username,
          role:                 users.role,
          tenantId:             users.tenantId,
          tenantName:           tenants.name,
          merchantId:           users.merchantId,
          status:    users.status,
          createdAt: users.createdAt,
          updatedAt:            users.updatedAt,
        })
        .from(users)
        .leftJoin(tenants, eq(users.tenantId, tenants.id))
      if (whereClause) dataQuery.where(whereClause)
      const data = await dataQuery
        .limit(limit)
        .offset(clampedOffset)
        .orderBy(users.createdAt, users.id)

      return { count, data, actualPage: clamped }
    }, { isolationLevel: 'repeatable read' })

    return {
      data: result.data,
      meta: { total: result.count, page: result.actualPage, limit },
    }
  },
}
