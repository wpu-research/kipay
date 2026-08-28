import {
  db, merchants, transactions, paymentAccounts, banks,
  eq, and, gte, lte, inArray,
} from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import { transactionService } from '../transactions/transaction.service.js'
import { blockedPlayerService } from '../blocked-players/blocked-player.service.js'
import type { InitiateTransactionInput, MerchantTransactionListQuery, TransactionStatus, WithdrawalRequestInput } from '@panel/types'

function serializeMerchantTx(tx: {
  id: string
  status: string
  type?: 'deposit' | 'withdrawal' | null
  amount: string
  currency: string
  externalUserId: string
  paymentMethod?: string | null
  userIdentityNumber?: string | null
  userMemberId?: string | null
  userFirstName?: string | null
  userMiddleName?: string | null
  userLastName?: string | null
  userPhone?: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    txId:           tx.id,
    status:         tx.status as TransactionStatus,
    type:           tx.type ?? null,
    amount:         tx.amount,
    currency:       tx.currency,
    externalUserId: tx.externalUserId,
    paymentMethod:  tx.paymentMethod ?? null,
    userInfo: {
      identityNumber: tx.userIdentityNumber ?? '',
      memberId:       tx.userMemberId ?? '',
      firstName:      tx.userFirstName ?? '',
      middleName:     tx.userMiddleName ?? '',
      lastName:       tx.userLastName ?? '',
      phone:          tx.userPhone ?? '',
    },
    createdAt:      tx.createdAt.toISOString(),
    updatedAt:      tx.updatedAt.toISOString(),
  }
}

export const merchantApiService = {

  async initiateDeposit(params: {
    tenantId:   string
    merchantId: string
    input:      InitiateTransactionInput
  }) {
    await blockedPlayerService.checkPlayerBlocked(params.merchantId, params.input.externalUserId)
    const tx = await transactionService.initiateTransaction(params)

    return {
      txId:           tx.id,
      status:         tx.currency?.toUpperCase() === 'CRYPTO' ? ('STARTED' as const) : ('PENDING' as const),
      amount:         tx.amount,
      currency:       tx.currency,
      depositAddress: (tx as any).depositAddress ?? undefined,
      accountName:    (tx as any).accountName    ?? undefined,
      cryptoAmounts:  (tx as any).cryptoAmounts  ?? undefined,
      expiresAt:      (tx as any).startedExpiresAt instanceof Date
        ? (tx as any).startedExpiresAt.toISOString()
        : (tx as any).startedExpiresAt ?? undefined,
    }
  },

  // Oyuncu "yatırdım" dediğinde site bu endpoint'i çağırır
  async playerConfirmedDeposit(params: { tenantId: string; merchantId: string; txId: string }) {
    const tx = await transactionService.playerConfirmedDeposit(params)
    // Havale: PROCESSING, Kripto (STARTED→PENDING): PENDING
    const status = (tx.status === 'PENDING' ? 'PENDING' : 'PROCESSING') as 'PROCESSING' | 'PENDING'
    return { txId: tx.id, status }
  },

  async requestWithdrawal(params: {
    tenantId:   string
    merchantId: string
    input:      WithdrawalRequestInput
  }) {
    await blockedPlayerService.checkPlayerBlocked(params.merchantId, params.input.externalUserId)
    const tx = await transactionService.requestWithdrawal(params)
    return { txId: tx.id, status: 'PENDING' as const, withdrawalAddress: tx.withdrawalAddress!, withdrawalAccountName: tx.withdrawalAccountName! }
  },

  async getTransaction(params: { tenantId: string; merchantId: string; txId: string }) {
    const { tenantId, merchantId, txId } = params

    const tx = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.id, txId),
        eq(transactions.tenantId, tenantId),
        eq(transactions.merchantId, merchantId),
      ),
    })
    if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)

    return { data: serializeMerchantTx(tx) }
  },

  async listTransactions(params: {
    tenantId:   string
    merchantId: string
  } & MerchantTransactionListQuery) {
    const { tenantId, merchantId, status, type, dateFrom, dateTo, page, limit } = params
    const offset = (page - 1) * limit

    const conditions: ReturnType<typeof eq>[] = [
      eq(transactions.tenantId, tenantId),
      eq(transactions.merchantId, merchantId),
    ]
    if (status)   conditions.push(eq(transactions.status, status as TransactionStatus))
    if (type)     conditions.push(eq(transactions.type, type))
    if (dateFrom) conditions.push(gte(transactions.createdAt, new Date(dateFrom)))
    if (dateTo)   conditions.push(lte(transactions.createdAt, new Date(dateTo)))
    const where = and(...conditions)

    const [rows, total] = await Promise.all([
      db.query.transactions.findMany({
        where,
        orderBy: (t, { desc }) => [desc(t.createdAt), desc(t.id)],
        limit,
        offset,
      }),
      db.$count(transactions, where),
    ])

    return {
      data: rows.map(serializeMerchantTx),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    }
  },

  async getPaymentMethods(params: { tenantId: string; merchantId: string }) {
    const { tenantId, merchantId } = params

    const merchant = await db.query.merchants.findFirst({
      where: and(eq(merchants.id, merchantId), eq(merchants.tenantId, tenantId)),
    })
    if (!merchant) {
      return { data: [] }
    }

    const environment = merchant.isSandbox ? 'sandbox' : 'production'

    const accounts = await db
      .select({ type: paymentAccounts.type, bankId: paymentAccounts.bankId })
      .from(paymentAccounts)
      .where(and(
        eq(paymentAccounts.tenantId, tenantId),
        eq(paymentAccounts.status, 'active'),
        eq(paymentAccounts.environment, environment),
      ))

    const bankIds = [...new Set(accounts.map(a => a.bankId).filter(Boolean))] as string[]
    const bankRows = bankIds.length
      ? await db.select({ id: banks.id, name: banks.name }).from(banks).where(inArray(banks.id, bankIds))
      : []
    const bankMap = new Map(bankRows.map(b => [b.id, b.name]))

    const names = new Set<string>()
    for (const a of accounts) {
      if (a.type === 'bank' && a.bankId) names.add(bankMap.get(a.bankId) ?? 'Banka')
      else if (a.type === 'crypto') names.add('Kripto')
    }

    return { data: [...names].sort().map(name => ({ name })) }
  },

  async getExchangeRates() {
    const allRates = await db.query.exchangeRates.findMany({
      orderBy: (t, { desc }) => [desc(t.fetchedAt)],
    })

    const latestMap = new Map<string, typeof allRates[0]>()
    for (const rate of allRates) {
      const key = `${rate.fromCurrency}-${rate.toCurrency}`
      if (!latestMap.has(key)) latestMap.set(key, rate)
    }

    const staleThreshold = new Date(Date.now() - 15 * 60 * 1000)

    return {
      data: Array.from(latestMap.values()).map(rate => ({
        fromCurrency: rate.fromCurrency,
        toCurrency:   rate.toCurrency,
        rate:         rate.rate,
        source:       rate.source,
        fetchedAt:    rate.fetchedAt.toISOString(),
        stale:        rate.fetchedAt < staleThreshold,
      })),
    }
  },
}
