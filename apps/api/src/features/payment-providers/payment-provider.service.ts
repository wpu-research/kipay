import { db, paymentProviders, paymentProviderCategories, eq, and, sql } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import type {
  CreatePaymentProviderInput,
  UpdatePaymentProviderInput,
  CreatePaymentProviderCategoryInput,
  UpdatePaymentProviderCategoryInput,
} from '@panel/types'

export const paymentProviderService = {

  // --- Sağlayıcılar ---

  async createProvider(tenantId: string, data: CreatePaymentProviderInput) {
    try {
      const [row] = await db.insert(paymentProviders).values({
        tenantId,
        name: data.name,
      }).returning()
      if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Sağlayıcı oluşturulamadı.', 500)
      return row
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('PROVIDER_NAME_CONFLICT', 'Bu sağlayıcı adı zaten kullanılıyor.', 409)
      }
      throw err
    }
  },

  async getProviders(tenantId: string, page: number, limit: number) {
    return db.transaction(async (tx) => {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(paymentProviders)
        .where(eq(paymentProviders.tenantId, tenantId))

      const totalPages = Math.max(1, Math.ceil(count / limit))
      const safePage   = Math.max(1, Math.min(page, totalPages))
      const offset     = (safePage - 1) * limit

      const data = await tx.select().from(paymentProviders)
        .where(eq(paymentProviders.tenantId, tenantId))
        .orderBy(paymentProviders.createdAt, paymentProviders.id)
        .limit(limit)
        .offset(offset)

      return { data, meta: { total: count, page: safePage, limit } }
    })
  },

  async updateProvider(tenantId: string, id: string, data: UpdatePaymentProviderInput) {
    const setValues: Record<string, unknown> = { updatedAt: new Date() }
    if (data.name   !== undefined) setValues.name   = data.name
    if (data.status !== undefined) setValues.status = data.status

    try {
      const rows = await db.update(paymentProviders)
        .set(setValues)
        .where(and(eq(paymentProviders.id, id), eq(paymentProviders.tenantId, tenantId)))
        .returning()
      if (rows.length === 0) throw new AppError('NOT_FOUND', 'Ödeme sağlayıcısı bulunamadı.', 404)
      return rows[0]!
    } catch (err: unknown) {
      if (err instanceof AppError) throw err
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('PROVIDER_NAME_CONFLICT', 'Bu sağlayıcı adı zaten kullanılıyor.', 409)
      }
      throw err
    }
  },

  // --- Kategoriler ---

  async createCategory(tenantId: string, data: CreatePaymentProviderCategoryInput) {
    try {
      const [row] = await db.insert(paymentProviderCategories).values({
        tenantId,
        name: data.name,
      }).returning()
      if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Kategori oluşturulamadı.', 500)
      return row
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('CATEGORY_NAME_CONFLICT', 'Bu kategori adı zaten kullanılıyor.', 409)
      }
      throw err
    }
  },

  async getCategories(tenantId: string, page: number, limit: number) {
    return db.transaction(async (tx) => {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(paymentProviderCategories)
        .where(eq(paymentProviderCategories.tenantId, tenantId))

      const totalPages = Math.max(1, Math.ceil(count / limit))
      const safePage   = Math.max(1, Math.min(page, totalPages))
      const offset     = (safePage - 1) * limit

      const data = await tx.select().from(paymentProviderCategories)
        .where(eq(paymentProviderCategories.tenantId, tenantId))
        .orderBy(paymentProviderCategories.createdAt, paymentProviderCategories.id)
        .limit(limit)
        .offset(offset)

      return { data, meta: { total: count, page: safePage, limit } }
    })
  },

  async updateCategory(tenantId: string, id: string, data: UpdatePaymentProviderCategoryInput) {
    try {
      const rows = await db.update(paymentProviderCategories)
        .set({ name: data.name, updatedAt: new Date() })
        .where(and(eq(paymentProviderCategories.id, id), eq(paymentProviderCategories.tenantId, tenantId)))
        .returning()
      if (rows.length === 0) throw new AppError('NOT_FOUND', 'Kategori bulunamadı.', 404)
      return rows[0]!
    } catch (err: unknown) {
      if (err instanceof AppError) throw err
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('CATEGORY_NAME_CONFLICT', 'Bu kategori adı zaten kullanılıyor.', 409)
      }
      throw err
    }
  },
}
