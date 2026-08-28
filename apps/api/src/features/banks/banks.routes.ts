import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { db, banks, eq } from '@panel/db'
import {
  BankListResponseSchema,
  BankResponseSchema,
  CreateBankSchema,
  UpdateBankStatusSchema,
} from '@panel/types'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'

async function requireSuperAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) {
    throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  }
  if (request.user.role !== 'super_admin') {
    throw new AppError('FORBIDDEN', 'Bu işlem yalnızca super admin yetkisiyle yapılabilir.', 403)
  }
}

function mapBank(b: typeof banks.$inferSelect) {
  return { ...b, createdAt: b.createdAt.toISOString() }
}

export const banksRoutes: FastifyPluginAsyncZod = async (app) => {

  // GET /banks — tüm bankalar (tüm roller)
  app.get('/', {
    preHandler: [authenticate],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema:     { tags: ['Banks'], summary: 'Banka listesi', response: { 200: BankListResponseSchema } },
  }, async (_request, reply) => {
    const rows = await db.select().from(banks).orderBy(banks.name)
    return reply.send({ data: rows.map(mapBank) })
  })

  // POST /banks — yeni banka ekle (super_admin)
  app.post('/', {
    preHandler: [authenticate, requireSuperAdmin],
    config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema:     { tags: ['Banks'], summary: 'Banka ekle', body: CreateBankSchema, response: { 201: BankResponseSchema } },
  }, async (request, reply) => {
    const { name, ibanCode } = request.body
    const existing = await db.select({ id: banks.id }).from(banks).where(eq(banks.name, name)).limit(1)
    if (existing.length > 0) {
      throw new AppError('BANK_NAME_CONFLICT', 'Bu isimde bir banka zaten mevcut.', 409)
    }
    const [row] = await db.insert(banks).values({ name, ibanCode: ibanCode ?? null }).returning()
    return reply.status(201).send({ data: mapBank(row!) })
  })

  // PATCH /banks/:id/status — aktif/pasif (super_admin)
  app.patch('/:id/status', {
    preHandler: [authenticate, requireSuperAdmin],
    config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema:     { tags: ['Banks'], summary: 'Banka durumu güncelle', params: z.object({ id: z.string().uuid() }), body: UpdateBankStatusSchema, response: { 200: BankResponseSchema } },
  }, async (request, reply) => {
    const [row] = await db.update(banks).set({ isActive: request.body.isActive }).where(eq(banks.id, request.params.id)).returning()
    if (!row) throw new AppError('NOT_FOUND', 'Banka bulunamadı.', 404)
    return reply.send({ data: mapBank(row) })
  })
}
