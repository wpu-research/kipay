import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  InitiateTransactionSchema,
  InitiateTransactionResponseSchema,
  DepositConfirmSchema,
  WithdrawalRequestSchema,
  WithdrawalResponseSchema,
  MerchantTransactionDetailResponseSchema,
  MerchantTransactionListQuerySchema,
  MerchantTransactionListResponseSchema,
  PaymentMethodsResponseSchema,
  ExchangeRatesResponseSchema,
  SimulateCallbackRequestSchema,
  SimulateCallbackResponseSchema,
  PlayerConfirmedResponseSchema,
} from '@panel/types'
import { merchantAuth } from '../../middleware/merchant-hmac.js'
import { merchantApiService } from './merchant-api.service.js'
import { callbackService } from '../callbacks/callback.service.js'

export const merchantApiRoutes: FastifyPluginAsyncZod = async (app) => {

  // POST /merchant/v1/deposit/initiate
  app.post('/deposit/initiate', {
    preHandler: [merchantAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchant API'],
      summary: 'Depozit başlat',
      body:     InitiateTransactionSchema,
      response: { 201: InitiateTransactionResponseSchema },
    },
  }, async (request, reply) => {
    const merchant = (request as any).merchant as { id: string; tenantId: string }

    const result = await merchantApiService.initiateDeposit({
      tenantId:   merchant.tenantId,
      merchantId: merchant.id,
      input:      request.body,
    })

    // Kripto depoziti STARTED'da oluşur — expiry job zamanla
    if (result.expiresAt) {
      await request.server.boss.send(
        'claim-timeout',
        { transactionId: result.txId, type: 'started' },
        { startAfter: new Date(result.expiresAt) },
      )
    }

    request.auditEntry = {
      action:       'transaction.initiated',
      resourceType: 'transaction',
      resourceId:   result.txId,
      tenantId:     merchant.tenantId,
      changes:      { amount: result.amount, currency: result.currency, merchantId: merchant.id },
    }

    return reply.status(201).send(result)
  })

  // POST /merchant/v1/deposit/player-confirmed — oyuncu "yatırdım" dedi
  app.post('/deposit/player-confirmed', {
    preHandler: [merchantAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchant API'],
      summary: 'Oyuncu ödeme yaptığını bildirdi',
      body:     z.object({ txId: z.string().uuid() }),
      response: { 200: PlayerConfirmedResponseSchema },
    },
  }, async (request, reply) => {
    const merchant = (request as any).merchant as { id: string; tenantId: string }

    const result = await merchantApiService.playerConfirmedDeposit({
      tenantId:   merchant.tenantId,
      merchantId: merchant.id,
      txId:       request.body.txId,
    })

    request.auditEntry = {
      action:       'transaction.player_confirmed',
      resourceType: 'transaction',
      resourceId:   result.txId,
      tenantId:     merchant.tenantId,
      changes:      {},
    }

    return reply.send(result)
  })

  // POST /merchant/v1/deposit/confirm — spec uyumlu alias (player-confirmed ile aynı davranış)
  app.post('/deposit/confirm', {
    preHandler: [merchantAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchant API'],
      summary: 'Depozit onayı (spec uyumlu alias)',
      body:     DepositConfirmSchema,
      response: { 200: PlayerConfirmedResponseSchema },
    },
  }, async (request, reply) => {
    const merchant = (request as any).merchant as { id: string; tenantId: string }
    const result = await merchantApiService.playerConfirmedDeposit({
      tenantId:   merchant.tenantId,
      merchantId: merchant.id,
      txId:       request.body.txId,
    })
    request.auditEntry = {
      action:       'transaction.player_confirmed',
      resourceType: 'transaction',
      resourceId:   result.txId,
      tenantId:     merchant.tenantId,
      changes:      {},
    }
    return reply.send(result)
  })

  // POST /merchant/v1/withdrawal/request
  app.post('/withdrawal/request', {
    preHandler: [merchantAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchant API'],
      summary: 'Para çekme talebi',
      body:     WithdrawalRequestSchema,
      response: { 201: WithdrawalResponseSchema },
    },
  }, async (request, reply) => {
    const merchant = (request as any).merchant as { id: string; tenantId: string }

    const result = await merchantApiService.requestWithdrawal({
      tenantId:   merchant.tenantId,
      merchantId: merchant.id,
      input:      request.body,
    })

    request.auditEntry = {
      action:       'withdrawal.requested',
      resourceType: 'transaction',
      resourceId:   result.txId,
      tenantId:     merchant.tenantId,
      changes:      { amount: request.body.amount, currency: request.body.currency },
    }

    return reply.status(201).send(result)
  })

  // GET /merchant/v1/transactions/:txId
  app.get('/transactions/:txId', {
    preHandler: [merchantAuth],
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchant API'],
      summary: 'İşlem detayı',
      params:   z.object({ txId: z.string().uuid() }),
      response: { 200: MerchantTransactionDetailResponseSchema },
    },
  }, async (request, reply) => {
    const merchant = (request as any).merchant as { id: string; tenantId: string }
    const result = await merchantApiService.getTransaction({
      tenantId:   merchant.tenantId,
      merchantId: merchant.id,
      txId:       request.params.txId,
    })
    return reply.send(result)
  })

  // GET /merchant/v1/transactions
  app.get('/transactions', {
    preHandler: [merchantAuth],
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchant API'],
      summary: 'İşlem listesi',
      querystring: MerchantTransactionListQuerySchema,
      response:    { 200: MerchantTransactionListResponseSchema },
    },
  }, async (request, reply) => {
    const merchant = (request as any).merchant as { id: string; tenantId: string }
    const result = await merchantApiService.listTransactions({
      tenantId:   merchant.tenantId,
      merchantId: merchant.id,
      ...request.query,
    })
    return reply.send(result)
  })

  // GET /merchant/v1/payment-methods
  app.get('/payment-methods', {
    preHandler: [merchantAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchant API'],
      summary: 'Ödeme yöntemleri',
      response: { 200: PaymentMethodsResponseSchema },
    },
  }, async (request, reply) => {
    const merchant = (request as any).merchant as { id: string; tenantId: string }
    const result = await merchantApiService.getPaymentMethods({
      tenantId:   merchant.tenantId,
      merchantId: merchant.id,
    })
    return reply.send(result)
  })

  // GET /merchant/v1/exchange-rates
  app.get('/exchange-rates', {
    preHandler: [merchantAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchant API'],
      summary: 'Döviz kurları',
      response: { 200: ExchangeRatesResponseSchema },
    },
  }, async (_request, reply) => {
    const result = await merchantApiService.getExchangeRates()
    return reply.send(result)
  })

  // POST /merchant/v1/sandbox/simulate-callback
  app.post('/sandbox/simulate-callback', {
    preHandler: [merchantAuth],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    schema: {
      tags: ['Merchant API'],
      summary: 'Sandbox callback simülasyonu',
      body:     SimulateCallbackRequestSchema,
      response: { 200: SimulateCallbackResponseSchema },
    },
  }, async (request, reply) => {
    const merchant = (request as any).merchant as { id: string; tenantId: string }
    const result = await callbackService.simulateCallback(
      merchant.id,
      request.body.txId,
      request.body.status,
    )
    return reply.send(result)
  })

}
