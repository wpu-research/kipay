import { db, transactions, paymentAccounts, merchants, transactionComments, blockedPlayers, exchangeRates, banks, eq, and, or, gt, gte, lte, sql, inArray, ilike, desc } from '@panel/db'
import type { TransactionComment } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import { validateRouting, selectPaymentAccountInTx } from './routing-engine.js'
import * as sseManager from '../../sse/sse-manager.js'
import { emitToUser } from '../../sse/sse-manager.js'
import { notificationService } from '../notifications/notification.service.js'
import { warningService } from '../warnings/warning.service.js'
import type { InitiateTransactionInput, TransactionStatus, WithdrawalRequestInput } from '@panel/types'
import { getClaimTimeoutMs } from '../settings/settings.service.js'

// STATE MACHINE — tek yetkili geçiş noktası
// Başka hiçbir servis transactions.status'u doğrudan güncelleyemez.

async function lookupTryRate(currency: string): Promise<{ exchangeRate: string; amountTry: (amount: string) => string } | null> {
  if (currency === 'TRY') return null

  const [rate] = await db
    .select({ rate: exchangeRates.rate })
    .from(exchangeRates)
    .where(and(eq(exchangeRates.fromCurrency, currency), eq(exchangeRates.toCurrency, 'TRY')))
    .orderBy(desc(exchangeRates.fetchedAt))
    .limit(1)

  if (!rate) return null
  return {
    exchangeRate: rate.rate,
    amountTry: (amount: string) => (parseFloat(amount) * parseFloat(rate.rate)).toFixed(2),
  }
}

async function calculateCryptoAmounts(
  paymentAccountId: string,
  amountTry: string,
): Promise<Record<string, string>> {
  const rows = await db.execute(sql`
    SELECT c.symbol, er.rate
    FROM payment_account_cryptos pac
    JOIN cryptos c ON c.id = pac.crypto_id
    JOIN LATERAL (
      SELECT rate FROM exchange_rates
      WHERE from_currency = c.symbol AND to_currency = 'TRY'
      ORDER BY fetched_at DESC
      LIMIT 1
    ) er ON true
    WHERE pac.payment_account_id = ${paymentAccountId}
  `)

  const result: Record<string, string> = {}
  for (const row of rows as unknown as { symbol: string; rate: string }[]) {
    result[row.symbol] = (parseFloat(amountTry) / parseFloat(row.rate)).toFixed(8)
  }
  return result
}

export const transactionService = {

  // v2: hesap initiate'de atanmıyor, claim anında routing yapılıyor
  async initiateTransaction(params: {
    tenantId:   string
    merchantId: string
    input:      InitiateTransactionInput
  }) {
    const { tenantId, merchantId, input } = params

    // Merchant + kur kontrolü
    await validateRouting({ tenantId, merchantId, currency: input.currency })
    const tryRate = await lookupTryRate(input.currency)

    const isCrypto = input.currency.toUpperCase() === 'CRYPTO'
    const { environment } = await validateRouting({ tenantId, merchantId, currency: input.currency })
    const STARTED_EXPIRES_MINUTES = 30
    const startedExpiresAt = isCrypto ? new Date(Date.now() + STARTED_EXPIRES_MINUTES * 60 * 1000) : undefined

    const { row, depositAddress, accountName } = await db.transaction(async (tx) => {
      // Block kontrolü — TOCTOU önlemi
      const now = new Date()
      const block = await tx.query.blockedPlayers.findFirst({
        where: and(
          eq(blockedPlayers.merchantId, merchantId),
          eq(blockedPlayers.externalUserId, input.externalUserId),
          or(
            eq(blockedPlayers.isPermanent, true),
            gt(blockedPlayers.blockedUntil, now),
          ),
        ),
      })
      if (block) {
        throw new AppError('USER_BLOCKED', 'Bu oyuncu engellenmiştir.', 403, {
          blockedUntil: block.blockedUntil?.toISOString() ?? null,
        })
      }

      // Kripto: initiate anında routing — statik cüzdan adresi hemen döndürülmeli
      // TRY (havale): hesap atanmıyor — claim anında routing yapılacak (v2)
      let paymentAccountId: string | null = null
      let depositAddress: string | null = null
      let accountName: string | null = null
      if (isCrypto) {
        const routeResult = await selectPaymentAccountInTx(tx, { tenantId, environment, amount: input.amount, currency: input.currency })
        paymentAccountId = routeResult.paymentAccountId
        depositAddress   = routeResult.accountNumber ?? null
        accountName      = routeResult.accountName   ?? null
      }

      const [inserted] = await tx.insert(transactions).values({
        tenantId,
        merchantId,
        paymentAccountId,
        externalUserId:   input.externalUserId,
        amount:           input.amount,
        currency:         input.currency,
        status:           isCrypto ? 'STARTED' : 'PENDING',
        type:             'deposit',
        startedExpiresAt: startedExpiresAt ?? null,
        exchangeRate:     tryRate?.exchangeRate ?? null,
        amountTry:        tryRate ? tryRate.amountTry(input.amount) : input.amount,
        // v1.1 userInfo
        userIdentityNumber: input.userInfo?.identityNumber ?? null,
        userMemberId:       input.userInfo?.memberId ?? null,
        userFirstName:      input.userInfo?.firstName ?? null,
        userMiddleName:     input.userInfo?.middleName ?? '',
        userLastName:       input.userInfo?.lastName ?? null,
        userPhone:          input.userInfo?.phone ?? null,
      }).returning()

      if (!inserted) throw new AppError('INTERNAL_SERVER_ERROR', 'İşlem oluşturulamadı.', 500)
      return { row: inserted, depositAddress, accountName }
    })

    let cryptoAmounts: Record<string, string> | undefined
    if (isCrypto && row.paymentAccountId) {
      cryptoAmounts = await calculateCryptoAmounts(row.paymentAccountId, row.amountTry ?? row.amount)
    }

    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.id, merchantId),
      columns: { merchantName: true },
    })

    // Panel'e SSE bildir
    const payload = {
      txId:         row.id,
      amount:       row.amount,
      currency:     row.currency,
      merchantName: merchant?.merchantName ?? '',
      createdAt:    row.createdAt.toISOString(),
    }
    sseManager.emitToTenant(tenantId, 'transaction.pending', { type: 'transaction.pending', ...payload })
    notificationService.createPendingNotifications({ tenantId, transactionId: row.id, payload }).catch(() => {})

    return { ...row, depositAddress, accountName, cryptoAmounts, startedExpiresAt }
  },

  // "Yatırdım" sinyali: oyuncu ödemeyi yaptığını bildiriyor
  async playerConfirmedDeposit(params: { tenantId: string; merchantId: string; txId: string }) {
    const { tenantId, merchantId, txId } = params

    // Havale v2 akışı: PROCESSING deposit'te playerConfirmed=true yap + taşerona SSE
    const [updated] = await db
      .update(transactions)
      .set({ playerConfirmed: true, playerConfirmedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(transactions.id, txId),
        eq(transactions.tenantId, tenantId),
        eq(transactions.merchantId, merchantId),
        eq(transactions.status, 'PROCESSING'),
        eq(transactions.type, 'deposit'),
        eq(transactions.playerConfirmed, false),
      ))
      .returning()

    if (updated) {
      if (updated.claimedBy) {
        emitToUser(tenantId, updated.claimedBy, {
          type:  'transaction.player_confirmed',
          txId:  updated.id,
          amount: updated.amount,
        })
      }
      return updated
    }

    // Kripto akışı: STARTED deposit'i PENDING'e çek — operatör artık görebilir ve onaylayabilir
    const [startedUpdated] = await db
      .update(transactions)
      .set({ status: 'PENDING', updatedAt: new Date() })
      .where(and(
        eq(transactions.id, txId),
        eq(transactions.tenantId, tenantId),
        eq(transactions.merchantId, merchantId),
        eq(transactions.status, 'STARTED'),
        eq(transactions.type, 'deposit'),
      ))
      .returning()

    if (startedUpdated) return startedUpdated

    // Geçersiz durum — neden başarısız olduğunu belirle
    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, txId), eq(transactions.tenantId, tenantId)),
    })
    if (!tx || tx.merchantId !== merchantId) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
    if (tx.playerConfirmed) return tx
    throw new AppError('INVALID_STATE_TRANSITION', 'Yalnızca PROCESSING veya STARTED deposit onaylanabilir.', 409)
  },

  async requestWithdrawal(params: {
    tenantId:   string
    merchantId: string
    input:      WithdrawalRequestInput
  }) {
    const { tenantId, merchantId, input } = params

    const tryRate = await lookupTryRate(input.currency)

    // 6-1: TOCTOU önlemi — block kontrolü insert ile aynı DB transaction içinde
    const withdrawal = await db.transaction(async (tx) => {
      const now = new Date()
      const block = await tx.query.blockedPlayers.findFirst({
        where: and(
          eq(blockedPlayers.merchantId, merchantId),
          eq(blockedPlayers.externalUserId, input.externalUserId),
          or(
            eq(blockedPlayers.isPermanent, true),
            gt(blockedPlayers.blockedUntil, now),
          ),
        ),
      })
      if (block) {
        throw new AppError('USER_BLOCKED', 'Bu oyuncu engellenmiştir.', 403, {
          blockedUntil: block.blockedUntil?.toISOString() ?? null,
        })
      }

      const [row] = await tx.insert(transactions).values({
        tenantId,
        merchantId,
        paymentAccountId:  null,
        externalUserId:    input.externalUserId,
        amount:            input.amount,
        currency:          input.currency,
        status:            'PENDING',
        type:              'withdrawal',
        paymentMethod:          input.paymentMethod,
        withdrawalAddress:      input.withdrawalAddress,
        withdrawalAccountName:  input.withdrawalAccountName,
        exchangeRate:      tryRate?.exchangeRate ?? null,
        amountTry:         tryRate ? tryRate.amountTry(input.amount) : input.amount,
        // v1.1 userInfo
        userIdentityNumber: input.userInfo?.identityNumber ?? null,
        userMemberId:       input.userInfo?.memberId ?? null,
        userFirstName:      input.userInfo?.firstName ?? null,
        userMiddleName:     input.userInfo?.middleName ?? '',
        userLastName:       input.userInfo?.lastName ?? null,
        userPhone:          input.userInfo?.phone ?? null,
      }).returning()

      if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'Withdrawal oluşturulamadı.', 500)
      return row
    })

    if (!withdrawal) throw new AppError('INTERNAL_SERVER_ERROR', 'Withdrawal oluşturulamadı.', 500)

    sseManager.emitToTenant(tenantId, 'transaction.pending', {
      type:     'transaction.pending',
      txId:     withdrawal.id,
      amount:   withdrawal.amount,
      currency: withdrawal.currency,
      merchantName: '',
      createdAt: withdrawal.createdAt.toISOString(),
    })

    return withdrawal
  },

  async getTransaction(tenantId: string, id: string) {
    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, id), eq(transactions.tenantId, tenantId)),
    })
    if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
    return tx
  },

  async claimTransaction(tenantId: string, userId: string, transactionId: string) {
    const timeoutMs = await getClaimTimeoutMs()

    // Önce işlemi bul (re-claim için mevcut hesap bilgisi de gerekli)
    const existing = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)),
      with: {
        merchant:       { columns: { isSandbox: true } },
        paymentAccount: { columns: { accountNumber: true, name: true }, with: { bank: { columns: { name: true } } } },
      },
    })
    if (!existing) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
    if (existing.status !== 'PENDING') throw new AppError('ALREADY_CLAIMED', 'İşlem zaten claim edilmiş veya tamamlanmış.', 409)

    // Routing + status update tek DB transaction'da — daily_used ve claim atomik
    const isDeposit = existing.type === 'deposit'
    const environment = (existing.merchant as any)?.isSandbox ? 'sandbox' : 'production'
    const claimExpiresAt = new Date(Date.now() + timeoutMs)

    const result = await db.transaction(async (tx) => {
      // Sadece deposit'larda routing yapılır — withdrawal'larda hesap atanmaz
      // Re-claim (timeout sonrası): paymentAccountId zaten set ise routing YAPMA — daily_used çift artmasın
      // claim-timeout claimedBy'ı null yaptığı için "farklı operatör" tespiti claimedBy ile güvenli değil;
      // farklı operatörün eski hesabı alması köşe durumu olarak kabul edilmiştir (timeout sonrası nadirdir)
      // Her taşeronun sadece kendi hesapları var — genel havuz yok
      // Uygun hesap yoksa (limit yetersiz vb.) taşeron işlemi alamaz
      let routeResult: Awaited<ReturnType<typeof selectPaymentAccountInTx>> | null = null
      if (isDeposit && !existing.paymentAccountId) {
        routeResult = await selectPaymentAccountInTx(tx, {
          tenantId, environment, amount: existing.amount, currency: existing.currency, ownedByUserId: userId,
        })
      }

      const assignedAccountId = routeResult?.paymentAccountId ?? existing.paymentAccountId
      const [claimed] = await tx
        .update(transactions)
        .set({
          status:           'PROCESSING',
          // callbackStatus='pending' sadece deposit + hesap atandıysa — withdrawal'larda
          // claim-time callback olmadığı için pending bırakılırsa callback-recovery yanlış tetiklenir
          callbackStatus:   (isDeposit && assignedAccountId) ? 'pending' : undefined,
          claimedBy:        userId,
          claimedAt:        new Date(),
          claimExpiresAt,
          paymentAccountId: assignedAccountId,
          updatedAt:        new Date(),
        })
        .where(and(
          eq(transactions.id, transactionId),
          eq(transactions.tenantId, tenantId),
          eq(transactions.status, 'PENDING'),
        ))
        .returning()

      if (!claimed) throw new AppError('ALREADY_CLAIMED', 'İşlem başka biri tarafından alındı.', 409)

      const existingPa = (existing as any).paymentAccount as { accountNumber: string; name: string; bank: { name: string } | null } | null
      return {
        ...claimed,
        depositAddress: routeResult?.accountNumber ?? existingPa?.accountNumber ?? null,
        accountName:    routeResult?.accountName   ?? existingPa?.name          ?? null,
        bankName:       routeResult?.bankName      ?? existingPa?.bank?.name    ?? null,
      }
    })

    return result
  },

  async listTransactions(tenantId: string, filters: {
    merchantId?:  string
    status?:      string
    type?:        'deposit' | 'withdrawal'
    paymentType?: 'bank' | 'crypto'
    bankId?:      string
    dateFrom?:    string
    dateTo?:      string
    minAmount?:   number
    maxAmount?:   number
    search?:      string
    searchType?:  'kullanici' | 'iban' | 'islem_id'
    page:         number
    limit:        number
  }) {
    const { merchantId, status, type, paymentType, bankId, dateFrom, dateTo, minAmount, maxAmount, search, searchType, page, limit } = filters
    const offset = (page - 1) * limit

    const conditions = [eq(transactions.tenantId, tenantId)]
    if (merchantId) conditions.push(eq(transactions.merchantId, merchantId))
    if (status) conditions.push(eq(transactions.status, status as TransactionStatus))
    if (type) conditions.push(eq(transactions.type, type))
    if (dateFrom) conditions.push(gte(transactions.createdAt, new Date(dateFrom)))
    if (dateTo) {
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      conditions.push(lte(transactions.createdAt, end))
    }
    if (minAmount) conditions.push(sql`CAST(${transactions.amount} AS NUMERIC) >= ${minAmount}`)
    if (maxAmount) conditions.push(sql`CAST(${transactions.amount} AS NUMERIC) <= ${maxAmount}`)
    if (search && searchType === 'kullanici') conditions.push(ilike(transactions.externalUserId, `%${search}%`))
    if (search && searchType === 'iban') conditions.push(sql`${transactions.withdrawalAddress} ILIKE ${'%' + search + '%'}`)
    if (search && searchType === 'islem_id') conditions.push(sql`${transactions.id}::text ILIKE ${search + '%'}`)
    if (paymentType || bankId) {
      const paConditions = [eq(paymentAccounts.tenantId, tenantId)]
      if (paymentType) paConditions.push(eq(paymentAccounts.type, paymentType))
      if (bankId)      paConditions.push(eq(paymentAccounts.bankId, bankId))
      const accountIds = await db
        .select({ id: paymentAccounts.id })
        .from(paymentAccounts)
        .where(and(...paConditions))
      conditions.push(inArray(transactions.paymentAccountId, accountIds.map((a) => a.id)))
    }
    const where = and(...conditions)

    const [rows, countResult] = await Promise.all([
      db.query.transactions.findMany({
        where,
        orderBy: (t, { desc }) => [desc(t.createdAt), desc(t.id)],
        limit,
        offset,
        with: {
          merchant:       { columns: { merchantName: true } },
          paymentAccount: { columns: { name: true }, with: { bank: { columns: { name: true } } } },
        },
      }),
      db.$count(transactions, where),
    ])

    const ibanCodes = [...new Set(
      rows
        .filter(r => r.paymentMethod?.toUpperCase() === 'IBAN' && r.withdrawalAddress)
        .map(r => r.withdrawalAddress!.slice(4, 9)),
    )]
    const bankMap: Record<string, string> = {}
    if (ibanCodes.length > 0) {
      const bankRows = await db
        .select({ ibanCode: banks.ibanCode, name: banks.name })
        .from(banks)
        .where(inArray(banks.ibanCode, ibanCodes))
      for (const b of bankRows) { if (b.ibanCode) bankMap[b.ibanCode] = b.name }
    }

    return {
      data: rows.map(r => ({
        ...r,
        withdrawalBankName: (r.paymentMethod?.toUpperCase() === 'IBAN' && r.withdrawalAddress)
          ? (bankMap[r.withdrawalAddress.slice(4, 9)] ?? null)
          : null,
      })),
      meta: { total: countResult, page, limit, totalPages: Math.ceil(countResult / limit) },
    }
  },

  async approveTransaction(tenantId: string, userId: string, transactionId: string, userRole: string) {
    const isAdmin = userRole === 'finans_admin' || userRole === 'tenant_admin'

    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)),
    })
    if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
    if (tx.status !== 'PROCESSING') throw new AppError('INVALID_STATE_TRANSITION', 'Yalnızca PROCESSING işlem onaylanabilir.', 409)
    if (!isAdmin && tx.claimedBy !== userId) throw new AppError('FORBIDDEN', 'Bu işlemi yalnızca claim eden finans onaylayabilir.', 403)

    const whereConditions = [
      eq(transactions.id, transactionId),
      eq(transactions.tenantId, tenantId),
      eq(transactions.status, 'PROCESSING'),
    ]
    if (!isAdmin) {
      whereConditions.push(eq(transactions.claimedBy, userId))
      whereConditions.push(gt(transactions.claimExpiresAt, sql`NOW()`))
    }

    const [approved] = await db
      .update(transactions)
      .set({ status: 'APPROVED', callbackStatus: 'pending', resolvedBy: userId, resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(...whereConditions))
      .returning()

    if (!approved) throw new AppError('INVALID_STATE_TRANSITION', 'Durum değiştirilemedi.', 409)
    return approved
  },

  async rejectTransaction(tenantId: string, userId: string, transactionId: string, reason: string, userRole: string) {
    if (!reason?.trim()) throw new AppError('REASON_REQUIRED', 'Red nedeni zorunludur.', 400)
    const isAdmin = userRole === 'finans_admin' || userRole === 'tenant_admin'

    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)),
    })
    if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
    if (tx.status !== 'PROCESSING') throw new AppError('INVALID_STATE_TRANSITION', 'Yalnızca PROCESSING işlem reddedilebilir.', 409)
    if (!isAdmin && tx.claimedBy !== userId) throw new AppError('FORBIDDEN', 'Bu işlemi yalnızca claim eden finans reddedebilir.', 403)

    const whereConditions = [
      eq(transactions.id, transactionId),
      eq(transactions.tenantId, tenantId),
      eq(transactions.status, 'PROCESSING'),
    ]
    if (!isAdmin) {
      whereConditions.push(eq(transactions.claimedBy, userId))
      whereConditions.push(gt(transactions.claimExpiresAt, sql`NOW()`))
    }

    const [rejected] = await db
      .update(transactions)
      .set({ status: 'REJECTED', callbackStatus: 'pending', note: reason, resolvedBy: userId, resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(...whereConditions))
      .returning()

    if (!rejected) throw new AppError('INVALID_STATE_TRANSITION', 'Durum değiştirilemedi.', 409)

    try {
      await warningService.evaluateRules({
        tenantId, merchantId: rejected.merchantId, transactionId: rejected.id,
        amount: rejected.amount, newStatus: 'REJECTED',
      })
    } catch (err) {
      console.error('[transaction.service] evaluateRules hatası (rejectTransaction):', err)
    }

    return rejected
  },

  async flagTransaction(tenantId: string, _userId: string, transactionId: string) {
    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)),
    })
    if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
    if (tx.status !== 'PROCESSING') throw new AppError('INVALID_STATE_TRANSITION', 'Yalnızca PROCESSING işlem flag\'lenebilir.', 409)

    const [flagged] = await db
      .update(transactions)
      .set({ status: 'FLAGGED', updatedAt: new Date() })
      .where(and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId), eq(transactions.status, 'PROCESSING')))
      .returning()

    if (!flagged) throw new AppError('INVALID_STATE_TRANSITION', 'Durum değiştirilemedi.', 409)
    return flagged
  },

  async addComment(params: {
    tenantId:      string
    transactionId: string
    userId:        string
    userRole:      string
    content:       string
  }): Promise<TransactionComment> {
    const { tenantId, transactionId, userId, userRole, content } = params

    if (!content?.trim()) throw new AppError('VALIDATION_ERROR', 'Yorum içeriği zorunludur.', 400)

    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)),
      columns: { id: true },
    })
    if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)

    const [comment] = await db
      .insert(transactionComments)
      .values({ tenantId, transactionId, userId, userRole, content })
      .returning()

    return comment
  },

  async getTransactionWithComments(tenantId: string, id: string) {
    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, id), eq(transactions.tenantId, tenantId)),
      with: {
        comments: {
          orderBy: (c, { asc }) => [asc(c.createdAt)],
        },
        merchant: {
          columns: { merchantName: true },
        },
        paymentAccount: {
          columns: { type: true, name: true, accountNumber: true },
          with: {
            bank:    { columns: { name: true } },
            cryptos: { with: { crypto: { columns: { name: true, symbol: true } } } },
          },
        },
      },
    })
    if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)

    let withdrawalBankName: string | null = null
    if (tx.paymentMethod?.toUpperCase() === 'IBAN' && tx.withdrawalAddress) {
      const ibanCode = tx.withdrawalAddress.slice(4, 9)
      const [bank] = await db
        .select({ name: banks.name })
        .from(banks)
        .where(eq(banks.ibanCode, ibanCode))
      withdrawalBankName = bank?.name ?? null
    }

    return { ...tx, withdrawalBankName }
  },

  async resolveTransaction(
    tenantId: string,
    userId: string,
    transactionId: string,
    decision: 'approved' | 'rejected',
    reason: string | undefined,
  ) {
    if (!reason?.trim()) throw new AppError('REASON_REQUIRED', 'Karar açıklaması zorunludur.', 400)

    const newStatus = decision === 'approved' ? 'COMPLETED' : 'REJECTED'

    const [resolved] = await db
      .update(transactions)
      .set({
        status:         newStatus,
        callbackStatus: 'pending',
        note:           reason,
        resolvedBy:     userId,
        resolvedAt:     new Date(),
        updatedAt:      new Date(),
      })
      .where(and(
        eq(transactions.id, transactionId),
        eq(transactions.tenantId, tenantId),
        eq(transactions.status, 'FLAGGED'),
      ))
      .returning()

    if (!resolved) {
      const tx = await db.query.transactions.findFirst({
        where: and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)),
      })
      if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
      throw new AppError('INVALID_STATE_TRANSITION', 'Yalnızca FLAGGED işlem kapatılabilir.', 409)
    }

    const evaluateStatus = newStatus as 'COMPLETED' | 'REJECTED'
    try {
      await warningService.evaluateRules({
        tenantId, merchantId: resolved.merchantId, transactionId: resolved.id,
        amount: resolved.amount, newStatus: evaluateStatus,
      })
    } catch (err) {
      console.error('[transaction.service] evaluateRules hatası (resolveTransaction):', err)
    }

    return resolved
  },

  // Farklı tutarla onayla: gelen para istenen tutardan farklıysa
  async approveTransactionWithAmount(tenantId: string, userId: string, transactionId: string, adjustedAmount: string, userRole: string) {
    const isAdmin = userRole === 'finans_admin' || userRole === 'tenant_admin'

    const tx = await db.query.transactions.findFirst({
      where: and(eq(transactions.id, transactionId), eq(transactions.tenantId, tenantId)),
    })
    if (!tx) throw new AppError('NOT_FOUND', 'İşlem bulunamadı.', 404)
    if (tx.status !== 'PROCESSING') throw new AppError('INVALID_STATE_TRANSITION', 'Yalnızca PROCESSING işlem onaylanabilir.', 409)
    if (!isAdmin && tx.claimedBy !== userId) throw new AppError('FORBIDDEN', 'Bu işlemi yalnızca claim eden finans onaylayabilir.', 403)

    const whereConditions = [
      eq(transactions.id, transactionId),
      eq(transactions.tenantId, tenantId),
      eq(transactions.status, 'PROCESSING'),
    ]
    if (!isAdmin) {
      whereConditions.push(eq(transactions.claimedBy, userId))
      whereConditions.push(gt(transactions.claimExpiresAt, sql`NOW()`))
    }

    // TRY işlemde amountTry = adjustedAmount; dövizde exchangeRate üzerinden yeniden hesapla
    const isTry = (tx.currency ?? 'TRY').toUpperCase() === 'TRY'
    const amountTry = isTry
      ? adjustedAmount
      : tx.exchangeRate
        ? (parseFloat(adjustedAmount) * parseFloat(tx.exchangeRate)).toFixed(2)
        : tx.amountTry  // kur yoksa mevcut değeri koru

    const [approved] = await db
      .update(transactions)
      .set({
        status:         'APPROVED',
        amount:         adjustedAmount,
        amountTry,
        callbackStatus: 'pending',
        resolvedBy:     userId,
        resolvedAt:     new Date(),
        updatedAt:      new Date(),
      })
      .where(and(...whereConditions))
      .returning()

    if (!approved) throw new AppError('INVALID_STATE_TRANSITION', 'İşlem onaylanamadı.', 409)
    return approved
  },

  async createManualWithdrawal(params: {
    tenantId:              string
    merchantId:            string
    externalUserId:        string
    amount:                string
    currency:              string
    paymentMethod:         string
    withdrawalAddress:     string
    withdrawalAccountName: string
  }) {
    const { tenantId, merchantId, externalUserId, amount, paymentMethod, withdrawalAddress, withdrawalAccountName } = params
    const currency = params.currency.toUpperCase()

    const [merchant, tryRate] = await Promise.all([
      db.query.merchants.findFirst({
        where: and(eq(merchants.id, merchantId), eq(merchants.tenantId, tenantId)),
        columns: { id: true, merchantName: true },
      }),
      lookupTryRate(currency),
    ])
    if (!merchant) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)

    const tx = await db.transaction(async (dbTx) => {
      const now = new Date()
      const block = await dbTx.query.blockedPlayers.findFirst({
        where: and(
          eq(blockedPlayers.merchantId, merchantId),
          eq(blockedPlayers.externalUserId, externalUserId),
          or(
            eq(blockedPlayers.isPermanent, true),
            gt(blockedPlayers.blockedUntil, now),
          ),
        ),
      })
      if (block) {
        throw new AppError('USER_BLOCKED', 'Bu oyuncu engellenmiştir.', 403, {
          blockedUntil: block.blockedUntil?.toISOString() ?? null,
        })
      }

      const [row] = await dbTx.insert(transactions).values({
        tenantId,
        merchantId,
        paymentAccountId:      null,
        externalUserId,
        amount,
        currency,
        status:                'PENDING',
        type:                  'withdrawal',
        paymentMethod,
        withdrawalAddress,
        withdrawalAccountName,
        exchangeRate:          tryRate?.exchangeRate ?? null,
        amountTry:             tryRate ? tryRate.amountTry(amount) : amount,
      }).returning()

      if (!row) throw new AppError('INTERNAL_SERVER_ERROR', 'İşlem oluşturulamadı.', 500)
      return row
    })

    if (!tx) throw new AppError('INTERNAL_SERVER_ERROR', 'İşlem oluşturulamadı.', 500)

    const pendingPayload = {
      txId:         tx.id,
      amount:       tx.amount,
      currency:     tx.currency,
      merchantName: merchant.merchantName,
      createdAt:    tx.createdAt.toISOString(),
    }

    sseManager.emitToTenant(tenantId, 'transaction.pending', {
      type: 'transaction.pending',
      ...pendingPayload,
    })

    notificationService.createPendingNotifications({
      tenantId,
      transactionId: tx.id,
      payload:       pendingPayload,
    }).catch(() => {})

    return tx
  },

}
