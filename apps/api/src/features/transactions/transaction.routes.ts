import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireTransactionProcessor, requireTenantAdmin, requireTenantOrFinansAdmin } from '../../middleware/roles.js'
import { AppError } from '../../errors/app-error.js'
import { transactionService } from './transaction.service.js'
import * as sseManager from '../../sse/sse-manager.js'
import { ClaimTransactionResponseSchema, TransactionListSchema, TransactionItemSchema, TransactionStatusEnum, ApproveRejectResponseSchema, TransactionDetailSchema, AddCommentSchema, ResolveTransactionSchema, ApproveWithAmountSchema } from '@panel/types'
import type { TransactionStatus } from '@panel/types'
import type { TransactionComment } from '@panel/db'

function serializeTransaction(tx: {
  id: string
  tenantId: string
  merchantId: string
  paymentAccountId: string | null
  externalUserId: string
  amount: string
  currency: string
  status: TransactionStatus
  type?: 'deposit' | 'withdrawal' | null
  startedExpiresAt?: Date | null
  paymentMethod?: string | null
  claimedBy: string | null
  claimedAt: Date | null
  claimExpiresAt: Date | null
  resolvedBy: string | null
  resolvedAt: Date | null
  note: string | null
  createdAt: Date
  updatedAt: Date
  callbackStatus?: string | null
  amountTry?: string | null
  exchangeRate?: string | null
  playerConfirmed?: boolean | null
  playerConfirmedAt?: Date | null
}) {
  return {
    ...tx,
    type:               tx.type             ?? null,
    paymentMethod:      tx.paymentMethod    ?? null,
    startedExpiresAt:   tx.startedExpiresAt?.toISOString() ?? null,
    claimedAt:          tx.claimedAt?.toISOString()        ?? null,
    claimExpiresAt:     tx.claimExpiresAt?.toISOString()   ?? null,
    resolvedAt:         tx.resolvedAt?.toISOString()       ?? null,
    createdAt:          tx.createdAt.toISOString(),
    updatedAt:          tx.updatedAt.toISOString(),
    merchantName:       null,
    paymentAccountName: null,
    callbackStatus:     (tx.callbackStatus as 'pending' | 'sent' | 'failed' | 'dead' | null) ?? null,
    amountTry:          tx.amountTry         ?? null,
    exchangeRate:       tx.exchangeRate      ?? null,
    playerConfirmed:    tx.playerConfirmed   ?? false,
    playerConfirmedAt:  tx.playerConfirmedAt?.toISOString() ?? null,
  }
}

function serializeComment(c: TransactionComment) {
  return { ...c, createdAt: c.createdAt.toISOString() }
}

export const transactionRoutes: FastifyPluginAsyncZod = async (fastify) => {

  // POST /:id/claim — finans_operator, finans_admin, tenant_admin (super_admin dahil değil — AC #5)
  fastify.post('/:id/claim', {
    preHandler: [authenticate, requireTransactionProcessor],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'İşlemi üstlen',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: ClaimTransactionResponseSchema },
    },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const { id } = request.params

    const claimed = await transactionService.claimTransaction(tenantId, userId, id)
    request.auditEntry = { action: 'transaction.claim', resourceType: 'transaction', resourceId: id, tenantId }

    // claim-timeout job: claim süresi dolunca çalışır
    await request.server.boss.send(
      'claim-timeout',
      { transactionId: claimed.id },
      { startAfter: claimed.claimExpiresAt! },
    )

    // Diğer finans kullanıcılarına SSE bildirim
    sseManager.emitToTenant(tenantId, 'transaction.claimed', {
      type:      'transaction.claimed',
      txId:      claimed.id,
      claimedBy: userId,
    })

    // Siteye callback gönder: hesap bilgisi artık hazır
    if (claimed.depositAddress) {
      sseManager.emitToTenant(tenantId, 'transaction.account_assigned', {
        type:           'transaction.account_assigned',
        txId:           claimed.id,
        status:         'PROCESSING' as const,
        depositAddress: claimed.depositAddress,
        accountName:    claimed.accountName,
        bankName:       claimed.bankName,
      })

      // Merchant webhook: PROCESSING durumu + hesap bilgisi
      request.server.boss.send(
        'callback-retry',
        { transactionId: claimed.id, expectedStatus: 'PROCESSING' },
        { retryLimit: 4, retryDelay: 30, singletonKey: `claim-${claimed.id}`, expireInSeconds: 300 },
      ).catch((err: unknown) => request.log.error({ err }, '[claim] callback-retry kuyruğa eklenemedi'))
    }

    return reply.send({
      ...serializeTransaction(claimed),
      status:         'PROCESSING' as const,
      claimedBy:      claimed.claimedBy!,
      claimedAt:      claimed.claimedAt!.toISOString(),
      claimExpiresAt: claimed.claimExpiresAt!.toISOString(),
      depositAddress: claimed.depositAddress ?? null,
      accountName:    claimed.accountName ?? null,
      bankName:       claimed.bankName ?? null,
    })
  })

  // GET /:id — tüm roller; işlem detayı + yorumlar
  fastify.get('/:id', {
    preHandler: [authenticate],
    config:     { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'İşlem detayı',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: TransactionDetailSchema },
    },
  }, async (request) => {
    const { tenantId } = request.user
    const { id } = request.params

    const tx = await transactionService.getTransactionWithComments(tenantId, id)
    const pa = tx.paymentAccount
    return {
      data: {
        ...serializeTransaction(tx),
        merchantName:          tx.merchant?.merchantName ?? null,
        withdrawalAccountName: (tx as any).withdrawalAccountName ?? null,
        withdrawalAddress:     (tx as any).withdrawalAddress     ?? null,
        withdrawalBankName:    (tx as any).withdrawalBankName    ?? null,
        comments:              tx.comments.map(serializeComment),
        paymentAccount: pa
          ? {
              type:          pa.type,
              name:          pa.name,
              accountNumber: pa.accountNumber,
              bank:          pa.bank ? { name: pa.bank.name } : null,
              cryptos:       pa.cryptos.map((c) => ({ crypto: { name: c.crypto.name, symbol: c.crypto.symbol } })),
            }
          : null,
      },
    }
  })

  // POST /:id/approve — finans_operator, finans_admin, tenant_admin (super_admin dahil değil — AC #5)
  fastify.post('/:id/approve', {
    preHandler: [authenticate, requireTransactionProcessor],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'İşlemi onayla',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: ApproveRejectResponseSchema },
    },
  }, async (request, reply) => {
    const { userId, tenantId, role } = request.user
    const { id } = request.params

    const approved = await transactionService.approveTransaction(tenantId, userId, id, role)
    request.auditEntry = { action: 'transaction.approve', resourceType: 'transaction', resourceId: id, tenantId }
    console.log(`[approve] tx=${approved.id} status=${approved.status} callbackStatus=${approved.callbackStatus}`)

    request.server.boss.send('callback-retry', { transactionId: approved.id }, { retryLimit: 4, retryDelay: 120, singletonKey: approved.id, expireInSeconds: 60 })
      .then((jobId: string | null) => console.log(`[approve] boss.send result: jobId=${jobId ?? 'null (singleton zaten kuyrukte)'}`))
      .catch((err: unknown) => request.log.error({ err }, '[approve] callback-retry kuyruğa eklenemedi'))

    return reply.send(serializeTransaction(approved))
  })

  // POST /:id/revise — terminal REJECTED/TIMEOUT deposit'i APPROVED'a çevirir (v1.1 revision)
  fastify.post('/:id/revise', {
    preHandler: [authenticate, requireTransactionProcessor],
    config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'Terminal işlemi revize et (REJECTED/TIMEOUT → APPROVED)',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: ApproveRejectResponseSchema },
    },
  }, async (request, reply) => {
    const { userId, tenantId, role } = request.user
    const { id } = request.params

    const revised = await transactionService.reviseTransaction(tenantId, userId, id, role)
    request.auditEntry = { action: 'transaction.revise', resourceType: 'transaction', resourceId: id, tenantId }
    console.log(`[revise] tx=${revised.id} ${revised.previousStatus}→APPROVED (revision)`)

    request.server.boss.send('callback-retry', { transactionId: revised.id }, { retryLimit: 4, retryDelay: 120, singletonKey: revised.id, expireInSeconds: 60 })
      .then((jobId: string | null) => console.log(`[revise] boss.send result: jobId=${jobId ?? 'null'}`))
      .catch((err: unknown) => request.log.error({ err }, '[revise] callback-retry kuyruğa eklenemedi'))

    return reply.send(serializeTransaction(revised))
  })
  fastify.post('/:id/reject', {
    preHandler: [authenticate, requireTransactionProcessor],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'İşlemi reddet',
      params:   z.object({ id: z.string().uuid() }),
      body:     z.object({ reason: z.string().min(1) }),
      response: { 200: ApproveRejectResponseSchema },
    },
  }, async (request, reply) => {
    const { userId, tenantId, role } = request.user
    const { id } = request.params
    const { reason } = request.body

    const rejected = await transactionService.rejectTransaction(tenantId, userId, id, reason, role)
    request.auditEntry = { action: 'transaction.reject', resourceType: 'transaction', resourceId: id, tenantId }
    console.log(`[reject] tx=${rejected.id} status=${rejected.status} callbackStatus=${rejected.callbackStatus}`)

    request.server.boss.send('callback-retry', { transactionId: rejected.id }, { retryLimit: 4, retryDelay: 120, singletonKey: rejected.id, expireInSeconds: 60 })
      .then((jobId: string | null) => console.log(`[reject] boss.send result: jobId=${jobId ?? 'null (singleton zaten kuyrukte)'}`))
      .catch((err: unknown) => request.log.error({ err }, '[reject] callback-retry kuyruğa eklenemedi'))

    return reply.send(serializeTransaction(rejected))
  })

  // POST /:id/flag — finans_operator, finans_admin, tenant_admin
  fastify.post('/:id/flag', {
    preHandler: [authenticate, requireTransactionProcessor],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'İşlemi işaretle',
      params:   z.object({ id: z.string().uuid() }),
      response: { 200: ApproveRejectResponseSchema },
    },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const { id } = request.params

    const flagged = await transactionService.flagTransaction(tenantId, userId, id)
    request.auditEntry = { action: 'transaction.flag', resourceType: 'transaction', resourceId: id, tenantId }
    return reply.send(serializeTransaction(flagged))
  })

  // POST /:id/comments — finans / operator / firma / super_admin
  fastify.post('/:id/comments', {
    preHandler: [authenticate],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'Yorum ekle',
      params:   z.object({ id: z.string().uuid() }),
      body:     AddCommentSchema,
    },
  }, async (request, reply) => {
    const { userId, tenantId, role } = request.user
    const { id } = request.params
    const { content } = request.body

    if (!['finans_admin', 'finans_operator', 'merchant', 'tenant_admin', 'super_admin'].includes(role)) {
      throw new AppError('FORBIDDEN', 'Bu endpoint finans veya merchant rolleri için geçerlidir.', 403)
    }

    const comment = await transactionService.addComment({
      tenantId,
      transactionId: id,
      userId,
      userRole: role,
      content,
    })

    return reply.status(201).send(serializeComment(comment))
  })

  // POST /:id/resolve — firma / super_admin; FLAGGED işlemi kapatır
  fastify.post('/:id/resolve', {
    preHandler: [authenticate, requireTenantAdmin],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'İşareti kapat',
      params:   z.object({ id: z.string().uuid() }),
      body:     ResolveTransactionSchema,
      response: { 200: ApproveRejectResponseSchema },
    },
  }, async (request, reply) => {
    const { userId, tenantId } = request.user
    const { id } = request.params
    const { decision, reason } = request.body

    const resolved = await transactionService.resolveTransaction(tenantId, userId, id, decision, reason)
    request.auditEntry = { action: 'transaction.resolve', resourceType: 'transaction', resourceId: id, tenantId }

    request.server.boss.send('callback-retry', { transactionId: resolved.id }, { retryLimit: 4, retryDelay: 120, singletonKey: resolved.id, expireInSeconds: 60 })
      .catch((err: unknown) => request.log.error({ err }, '[resolve] callback-retry kuyruğa eklenemedi'))

    return reply.status(200).send(serializeTransaction(resolved))
  })

  // GET / — finans rolü kendi grubunu, diğer roller tenant-scoped tüm listeyi görür
  fastify.get('/', {
    preHandler: [authenticate],
    config:     { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'İşlem listesi',
      querystring: z.object({
        status:      TransactionStatusEnum.optional(),
        type:        z.enum(['deposit', 'withdrawal']).optional(),
        merchantId:  z.string().uuid().optional(),
        paymentType: z.enum(['bank', 'crypto']).optional(),
        bankId:      z.string().uuid().optional(),
        dateFrom:    z.string().optional(),
        dateTo:      z.string().optional(),
        minAmount:   z.coerce.number().positive().optional(),
        maxAmount:   z.coerce.number().positive().optional(),
        search:      z.string().optional(),
        searchType:  z.enum(['kullanici', 'iban', 'islem_id']).optional(),
        page:        z.coerce.number().int().min(1).max(1000).default(1),
        limit:       z.coerce.number().int().min(1).max(100).default(20),
      }),
      response: { 200: TransactionListSchema },
    },
  }, async (request) => {
    const { tenantId } = request.user
    const { status, type, merchantId, paymentType, bankId, dateFrom, dateTo, minAmount, maxAmount, search, searchType, page, limit } = request.query

    const result = await transactionService.listTransactions(tenantId, {
      merchantId,
      status,
      type,
      paymentType,
      bankId,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      search,
      searchType,
      page,
      limit,
    })
    return {
      data: result.data.map((tx) => ({
        ...serializeTransaction(tx),
        merchantName:       (tx as any).merchant?.merchantName       ?? null,
        paymentAccountName: (tx as any).paymentAccount
          ? ((tx as any).paymentAccount.bank?.name ?? (tx as any).paymentAccount.name)
          : ((tx as any).withdrawalBankName ?? (tx as any).withdrawalAccountName ?? null),
      })),
      meta: result.meta,
    }
  })

  // POST /manual-withdrawal — tenant_admin / finans_admin: manuel çekim oluştur
  fastify.post('/manual-withdrawal', {
    preHandler: [authenticate, requireTenantOrFinansAdmin],
    config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'Manuel çekim oluştur',
      body: z.object({
        merchantId:            z.string().uuid(),
        externalUserId:        z.string().min(1),
        amount:                z.string().regex(/^\d+(\.\d{1,2})?$/),
        currency:              z.string().min(1).max(10).default('TRY'),
        paymentMethod:         z.string().min(1),
        withdrawalAddress:     z.string().min(1),
        withdrawalAccountName: z.string().min(1),
      }).superRefine((data, ctx) => {
        if (data.paymentMethod.toUpperCase() === 'IBAN' && !/^TR\d{24}$/.test(data.withdrawalAddress)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['withdrawalAddress'],
            message: 'Geçersiz IBAN formatı. Beklenen format: TR + 24 rakam.',
          })
        }
      }),
      response: { 201: TransactionItemSchema },
    },
  }, async (request, reply) => {
    const { tenantId } = request.user
    const { merchantId, externalUserId, amount, currency, paymentMethod, withdrawalAddress, withdrawalAccountName } = request.body

    const tx = await transactionService.createManualWithdrawal({
      tenantId, merchantId, externalUserId, amount, currency,
      paymentMethod, withdrawalAddress, withdrawalAccountName,
    })

    request.auditEntry = {
      action:       'transaction.manual_withdrawal_created',
      resourceType: 'transaction',
      resourceId:   tx.id,
      tenantId,
      changes:      { merchantId, externalUserId, amount, currency, paymentMethod },
    }

    return reply.status(201).send(serializeTransaction(tx))
  })

  // POST /:id/approve-with-amount — farklı tutarla onayla
  fastify.post('/:id/approve-with-amount', {
    preHandler: [authenticate, requireTransactionProcessor],
    config:     { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Transactions'],
      summary: 'Farklı tutarla onayla',
      params:   z.object({ id: z.string().uuid() }),
      body:     ApproveWithAmountSchema,
      response: { 200: ApproveRejectResponseSchema },
    },
  }, async (request, reply) => {
    const { userId, tenantId, role } = request.user
    const { id } = request.params
    const { adjustedAmount } = request.body

    const approved = await transactionService.approveTransactionWithAmount(tenantId, userId, id, adjustedAmount, role)
    request.auditEntry = { action: 'transaction.approve_with_amount', resourceType: 'transaction', resourceId: id, tenantId }
    request.server.boss.send('callback-retry', { transactionId: approved.id }, { retryLimit: 4, retryDelay: 120, singletonKey: approved.id, expireInSeconds: 60 })
      .then((jobId: string | null) => console.log(`[approve-with-amount] tx=${approved.id} adjusted=${adjustedAmount} jobId=${jobId ?? 'null'}`))
      .catch((err: unknown) => request.log.error({ err }, '[approve-with-amount] callback-retry kuyruğa eklenemedi'))
    return reply.send(serializeTransaction(approved))
  })
}
