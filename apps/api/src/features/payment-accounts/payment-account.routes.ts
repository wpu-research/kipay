import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import {
  CreatePaymentAccountSchema,
  UpdatePaymentAccountSchema,
  UpdatePaymentAccountStatusSchema,
  UpdateDailyLimitSchema,
  PaymentAccountResponseSchema,
  PaymentAccountListResponseSchema,
} from '@panel/types'
import { paymentAccountService } from './payment-account.service.js'
import { authenticate } from '../../middleware/auth.js'
import { AppError } from '../../errors/app-error.js'

const ALLOWED_ROLES = ['tenant_admin', 'finans_admin', 'super_admin'] as const

async function requireFinansAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!(ALLOWED_ROLES as readonly string[]).includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu işlem için finans_admin yetkisi gerekli.', 403)
  }
}

function serializeAccount(a: Awaited<ReturnType<typeof paymentAccountService.getAccount>>) {
  return {
    ...a,
    bank:       a.bank ? { ...a.bank, createdAt: a.bank.createdAt.toISOString() } : null,
    cryptos:    a.cryptos.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    lastResetAt: a.lastResetAt ? a.lastResetAt.toISOString() : null,
    createdAt:   a.createdAt.toISOString(),
    updatedAt:   a.updatedAt.toISOString(),
  }
}

export const paymentAccountRoutes: FastifyPluginAsyncZod = async (app) => {

  // POST /payment-accounts
  app.post('/', {
    preHandler: [authenticate, requireFinansAdmin],
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    schema: {
      tags: ['Payment Accounts'],
      summary: 'Ödeme hesabı oluştur',
      body:     CreatePaymentAccountSchema,
      response: { 201: PaymentAccountResponseSchema },
    },
  }, async (request, reply) => {
    const account = await paymentAccountService.createAccount(request.user.tenantId, request.body, request.user.userId)
    request.auditEntry = { action: 'create', resourceType: 'payment_account', resourceId: account.id, tenantId: request.user.tenantId }
    return reply.status(201).send({ data: serializeAccount(account) })
  })

  // GET /payment-accounts
  app.get('/', {
    preHandler: [authenticate, requireFinansAdmin],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Payment Accounts'],
      summary: 'Ödeme hesabı listesi',
      querystring: z.object({
        status: z.enum(['active', 'inactive']).optional(),
        type:   z.enum(['bank', 'crypto']).optional(),
        bankId: z.string().uuid().optional(),
        page:   z.coerce.number().int().min(1).default(1),
        limit:  z.coerce.number().int().min(1).max(100).default(20),
      }),
      response: { 200: PaymentAccountListResponseSchema },
    },
  }, async (request, reply) => {
    const { status, type, bankId, page, limit } = request.query
    const result = await paymentAccountService.listAccounts(
      request.user.tenantId,
      { status, type, bankId },
      page,
      limit,
    )
    return reply.send({
      data: result.data.map(serializeAccount),
      meta: result.meta,
    })
  })

  // GET /payment-accounts/:id
  app.get('/:id', {
    preHandler: [authenticate, requireFinansAdmin],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Payment Accounts'],
      summary: 'Ödeme hesabı detayı',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: PaymentAccountResponseSchema },
    },
  }, async (request, reply) => {
    const account = await paymentAccountService.getAccount(request.user.tenantId, request.params.id)
    return reply.send({ data: serializeAccount(account) })
  })

  // PUT /payment-accounts/:id
  app.put('/:id', {
    preHandler: [authenticate, requireFinansAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Payment Accounts'],
      summary: 'Ödeme hesabı güncelle',
      params:   z.object({ id: z.string().uuid() }),
      body:     UpdatePaymentAccountSchema,
      response: { 200: PaymentAccountResponseSchema },
    },
  }, async (request, reply) => {
    const account = await paymentAccountService.updateAccount(request.user.tenantId, request.params.id, request.body)
    request.auditEntry = { action: 'update', resourceType: 'payment_account', resourceId: account.id, tenantId: request.user.tenantId, changes: request.body }
    return reply.send({ data: serializeAccount(account) })
  })

  // PATCH /payment-accounts/:id/status
  app.patch('/:id/status', {
    preHandler: [authenticate, requireFinansAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Payment Accounts'],
      summary: 'Hesap durumu güncelle',
      params:   z.object({ id: z.string().uuid() }),
      body:     UpdatePaymentAccountStatusSchema,
      response: { 200: PaymentAccountResponseSchema },
    },
  }, async (request, reply) => {
    const account = await paymentAccountService.updateStatus(request.user.tenantId, request.params.id, request.body)
    request.auditEntry = { action: 'update', resourceType: 'payment_account', resourceId: account.id, tenantId: request.user.tenantId, changes: { status: request.body.status } }
    return reply.send({ data: serializeAccount(account) })
  })

  // PUT /payment-accounts/:id/daily-limit
  app.put('/:id/daily-limit', {
    preHandler: [authenticate, requireFinansAdmin],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Payment Accounts'],
      summary: 'Günlük limit güncelle',
      params:   z.object({ id: z.string().uuid() }),
      body:     UpdateDailyLimitSchema,
      response: { 200: PaymentAccountResponseSchema },
    },
  }, async (request, reply) => {
    const account = await paymentAccountService.updateDailyLimit(request.user.tenantId, request.params.id, request.body)
    request.auditEntry = { action: 'update', resourceType: 'payment_account', resourceId: account.id, tenantId: request.user.tenantId, changes: { dailyLimit: request.body.dailyLimit } }
    return reply.send({ data: serializeAccount(account) })
  })
}
