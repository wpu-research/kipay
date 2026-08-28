import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import {
  CurrentRatesResponseSchema,
  SyncResponseSchema,
  ExchangeRateHistoryQuerySchema,
  ExchangeRateHistoryResponseSchema,
} from './exchange-rate.schema.js'
import { exchangeRateService } from './exchange-rate.service.js'
import { authenticate } from '../../middleware/auth.js'
import { requireSuperAdmin } from '../../middleware/roles.js'
import { db, exchangeRates, eq, and, gte, lte, desc, count } from '@panel/db'

export const exchangeRateRoutes: FastifyPluginAsyncZod = async (app) => {

  // POST /api/v1/exchange-rates/sync — dış kaynaktan senkronizasyon (yalnızca super_admin)
  app.post('/sync', {
    preHandler: [authenticate, requireSuperAdmin],
    schema: {
      response: { 200: SyncResponseSchema },
      tags:     ['ExchangeRates'],
      summary:  'Dış kaynaktan kur senkronizasyonu',
    },
  }, async (_request, reply) => {
    const result = await exchangeRateService.syncFromExternal()
    return reply.send({
      synced:    result.synced,
      source:    result.source,
      fetchedAt: result.fetchedAt.toISOString(),
    })
  })

  // GET /api/v1/exchange-rates/history — kur geçmişi (sayfalı)
  app.get('/history', {
    preHandler: [authenticate],
    schema: {
      querystring: ExchangeRateHistoryQuerySchema,
      response:    { 200: ExchangeRateHistoryResponseSchema },
      tags:        ['ExchangeRates'],
      summary:     'Döviz kuru geçmişi',
    },
  }, async (request, reply) => {
    const { currency, from, to, page, limit } = request.query

    const conditions = [
      currency ? eq(exchangeRates.fromCurrency, currency) : undefined,
      from     ? gte(exchangeRates.createdAt, new Date(from + 'T00:00:00.000Z')) : undefined,
      to       ? lte(exchangeRates.createdAt, new Date(to + 'T23:59:59.999Z'))   : undefined,
    ].filter(Boolean) as ReturnType<typeof eq>[]

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [[{ count: total }], rows] = await Promise.all([
      db.select({ count: count() }).from(exchangeRates).where(where),
      db
        .select()
        .from(exchangeRates)
        .where(where)
        .orderBy(desc(exchangeRates.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
    ])

    return reply.send({
      data: rows.map(r => ({
        id:           r.id,
        fromCurrency: r.fromCurrency,
        toCurrency:   r.toCurrency,
        rate:         r.rate,
        source:       r.source,
        fetchedAt:    r.fetchedAt.toISOString(),
        createdAt:    r.createdAt.toISOString(),
      })),
      meta: { total: Number(total), page, limit },
    })
  })

  // GET /api/v1/exchange-rates/current — güncel kurlar
  app.get('/current', {
    preHandler: [authenticate],
    schema: {
      response: { 200: CurrentRatesResponseSchema },
      tags:     ['ExchangeRates'],
      summary:  'Güncel döviz kurları',
    },
  }, async (_request, reply) => {
    const rates = await exchangeRateService.getCurrent()
    return reply.send({
      data: rates.map((r) => ({
        ...r,
        fetchedAt: r.fetchedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { total: rates.length, page: 1, limit: 100 },
    })
  })
}
