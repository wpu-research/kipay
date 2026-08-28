import { db, tenants, auditLogs, users, eq, ne, sql } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import type { CreateTenantInput, UpdateTenantInput } from '@panel/types'

// PostgreSQL unique constraint violation error code
const PG_UNIQUE_VIOLATION = '23505'

// P-4 fix: Yalnızca slug unique constraint ihlali — diğer unique kolon ihlalleri karışmaz
function isSlugUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const pgErr = err as { code?: string; constraint?: string }
  return pgErr.code === PG_UNIQUE_VIOLATION && pgErr.constraint === 'tenants_slug_unique'
}

export const tenantService = {

  async createTenant(data: CreateTenantInput) {
    try {
      const [tenant] = await db.insert(tenants).values({
        name: data.name,
        slug: data.slug,
      }).returning()
      return tenant!
    } catch (err) {
      if (isSlugUniqueViolation(err)) {
        throw new AppError('TENANT_SLUG_CONFLICT', `'${data.slug}' slug'ı zaten kullanımda.`, 409)
      }
      // P-4 (CR-6): Beklenmedik DB hatalarını raw nesne olarak yaymak yerine sar
      throw new AppError('INTERNAL_ERROR', 'Tenant oluşturulurken bir hata oluştu.', 500)
    }
  },

  async updateTenant(id: string, data: UpdateTenantInput) {
    try {
      // P-3 (CR-6): Gereksiz findFirst kaldırıldı — returning() boş kontrolü yeterli
      // P-5: Açık alan eşlemesi — undefined alanlar SET clause'a dahil edilmez
      // P-6: updatedAt açıkça set edilir — Drizzle $onUpdate sürüme göre davranış değişebilir
      const rows = await db.update(tenants)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.slug !== undefined && { slug: data.slug }),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id))
        .returning()

      if (rows.length === 0) {
        throw new AppError('NOT_FOUND', 'Tenant bulunamadı.', 404)
      }
      return rows[0]!
    } catch (err) {
      if (err instanceof AppError) throw err
      if (isSlugUniqueViolation(err)) {
        throw new AppError('TENANT_SLUG_CONFLICT', `'${data.slug ?? '(bilinmeyen)'}' slug'ı zaten kullanımda.`, 409)
      }
      // P-4 (CR-6): Beklenmedik DB hatalarını sar
      throw new AppError('INTERNAL_ERROR', 'Tenant güncellenirken bir hata oluştu.', 500)
    }
  },

  async updateTenantStatus(id: string, status: 'active' | 'inactive') {
    // P-3 (CR-6): Gereksiz findFirst kaldırıldı — returning() boş kontrolü concurrent silmeyi de yakalar
    const rows = await db.update(tenants)
      .set({ status, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning()

    if (rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Tenant bulunamadı.', 404)
    }
    return rows[0]!
  },

  async getTenants(page: number, limit: number) {
    // P-2: Tek transaction — count ve data arasında insert/delete olursa tutarsızlık olmaz
    // Sistem tenant'ı (slug='super-admin') listede gizlenir
    const visibleFilter = ne(tenants.slug, 'super-admin')
    return db.transaction(async (tx) => {
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(tenants).where(visibleFilter)

      // P-6: Out-of-range page → son geçerli sayfaya kısıtla
      const totalPages = Math.max(1, Math.ceil(count / limit))
      const safePage = Math.max(1, Math.min(page, totalPages))
      const offset = (safePage - 1) * limit

      const data = await tx.select().from(tenants)
        .where(visibleFilter)
        .limit(limit)
        .offset(offset)
        .orderBy(tenants.createdAt)
      return { data, meta: { total: count, page: safePage, limit } }
    })
  },

  async getTenantById(id: string) {
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, id) })
    if (!tenant) throw new AppError('NOT_FOUND', 'Tenant bulunamadı.', 404)
    return tenant
  },

  async deleteTenant(id: string) {
    // Sistem tenant'ı silinemez
    const target = await db.query.tenants.findFirst({ where: eq(tenants.id, id) })
    if (target?.slug === 'super-admin') {
      throw new AppError('FORBIDDEN', 'Sistem tenant\'ı silinemez.', 403)
    }
    try {
      const rows = await db.transaction(async (tx) => {
        // FK bağımlılıklarını sırayla temizle
        await tx.delete(auditLogs).where(eq(auditLogs.tenantId, id))
        await tx.delete(users).where(eq(users.tenantId, id))
        return tx.delete(tenants).where(eq(tenants.id, id)).returning()
      })
      if (rows.length === 0) {
        throw new AppError('NOT_FOUND', 'Tenant bulunamadı.', 404)
      }
      return rows[0]!
    } catch (err) {
      if (err instanceof AppError) throw err
      const pgErr = err as { code?: string }
      if (pgErr.code === '23503') {
        throw new AppError('TENANT_HAS_RELATIONS', 'Bu tenant\'a bağlı veriler mevcut. Silmeden önce bağlı kullanıcı, merchant ve diğer verileri silin.', 409)
      }
      throw new AppError('INTERNAL_ERROR', 'Tenant silinirken bir hata oluştu.', 500)
    }
  },
}
