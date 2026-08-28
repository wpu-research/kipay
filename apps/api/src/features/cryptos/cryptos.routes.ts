import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { db, cryptos, eq } from '@panel/db'
import { CryptoListResponseSchema, CryptoResponseSchema, CreateCryptoSchema, UpdateCryptoStatusSchema } from '@panel/types'
import { authenticate } from '../../middleware/auth.js'
import { requireSuperAdmin } from '../../middleware/roles.js'
import { AppError } from '../../errors/app-error.js'

function mapCrypto(c: typeof cryptos.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() }
}

export const cryptosRoutes: FastifyPluginAsyncZod = async (app) => {

  // GET /cryptos — tüm kripto paralar
  app.get('/', {
    preHandler: [authenticate],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema:     { tags: ['Cryptos'], summary: 'Kripto para listesi', response: { 200: CryptoListResponseSchema } },
  }, async (_request, reply) => {
    const rows = await db.select().from(cryptos).orderBy(cryptos.symbol)
    return reply.send({ data: rows.map(mapCrypto) })
  })

  // POST /cryptos — yeni kripto ekle (super_admin)
  app.post('/', {
    preHandler: [authenticate, requireSuperAdmin],
    config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema:     { tags: ['Cryptos'], summary: 'Kripto ekle', body: CreateCryptoSchema, response: { 201: CryptoResponseSchema } },
  }, async (request, reply) => {
    const { name, symbol } = request.body
    const existing = await db.select({ id: cryptos.id }).from(cryptos).where(eq(cryptos.symbol, symbol)).limit(1)
    if (existing.length > 0) throw new AppError('CRYPTO_SYMBOL_CONFLICT', 'Bu sembolle bir kripto zaten mevcut.', 409)
    const [row] = await db.insert(cryptos).values({ name, symbol }).returning()
    return reply.status(201).send({ data: mapCrypto(row!) })
  })

  // PATCH /cryptos/:id/status — aktif/pasif (super_admin)
  app.patch('/:id/status', {
    preHandler: [authenticate, requireSuperAdmin],
    config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema:     { tags: ['Cryptos'], summary: 'Kripto durumu güncelle', params: z.object({ id: z.string().uuid() }), body: UpdateCryptoStatusSchema, response: { 200: CryptoResponseSchema } },
  }, async (request, reply) => {
    const [row] = await db.update(cryptos).set({ isActive: request.body.isActive }).where(eq(cryptos.id, request.params.id)).returning()
    if (!row) throw new AppError('NOT_FOUND', 'Kripto bulunamadı.', 404)
    return reply.send({ data: mapCrypto(row) })
  })
}
