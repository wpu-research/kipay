import { createHmac } from 'node:crypto'
import { db, transactions, callbackLogs, eq, and, gte } from '@panel/db'
import { env } from '../config/env.js'

const MAX_ATTEMPTS = 5

export async function callbackRetry(jobs: Array<{ data: { transactionId: string; expectedStatus?: string } }>) {
  const job = jobs[0]
  if (!job) return
  const { transactionId, expectedStatus } = job.data
  console.log(`[callback-retry] ▶ başladı txId=${transactionId}`)

  // 1. Transaction yükle
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
    with: { merchant: true },
  })

  if (!tx) {
    console.warn(`[callback-retry] İşlem ${transactionId} bulunamadı — atlandı`)
    return
  }

  // Idempotency: zaten gönderildiyse veya kalıcı olarak başarısızsa tekrar gönderme
  if (tx.callbackStatus === 'sent' || tx.callbackStatus === 'failed') {
    console.log(`[callback-retry] ${transactionId}: callbackStatus=${tx.callbackStatus} — atlandı`)
    return
  }

  // Stale job guard: PROCESSING callback geç retry'ı COMPLETED/REJECTED sonrası gelirse skip et
  // Bu, farklı singletonKey kullanılan PROCESSING ve terminal callback'lerin yarışmasını önler
  if (expectedStatus && tx.status !== expectedStatus) {
    console.warn(`[callback-retry] ${transactionId}: job expectedStatus=${expectedStatus} ama tx.status=${tx.status} — stale job, atlandı`)
    return
  }

  console.log(`[callback-retry] tx bulundu status=${tx.status} callbackStatus=${tx.callbackStatus} merchant=${tx.merchant?.merchantName ?? 'null'} webhookUrl=${tx.merchant?.webhookUrl ?? 'null'}`)

  // 2. APPROVED ise önce COMPLETED'a geçir (atomik; stub davranışı korunuyor)
  if (tx.status === 'APPROVED') {
    const [completed] = await db
      .update(transactions)
      .set({ status: 'COMPLETED', updatedAt: new Date() })
      .where(and(eq(transactions.id, transactionId), eq(transactions.status, 'APPROVED')))
      .returning()

    if (!completed) {
      console.warn(`[callback-retry] ${transactionId}: APPROVED → COMPLETED geçişi başka process tarafından yapıldı`)
    }
  }

  // 3. Güncel tx'i yeniden yükle (PROCESSING callback için hesap bilgisi de gerekli)
  const freshTx = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
    with: {
      merchant:       true,
      paymentAccount: { columns: { accountNumber: true, name: true }, with: { bank: { columns: { name: true } } } },
    },
  })

  if (!freshTx) return

  const callbackStatuses = ['PROCESSING', 'COMPLETED', 'REJECTED', 'TIMEOUT'] as const
  console.log(`[callback-retry] freshTx status=${freshTx.status}`)
  if (!callbackStatuses.includes(freshTx.status as any)) {
    console.warn(`[callback-retry] ${transactionId}: status=${freshTx.status} — callback göndermek için uygun değil, atlandı`)
    return
  }

  // 4. Merchant ve callbackSecret kontrolü
  const merchant = freshTx.merchant
  console.log(`[callback-retry] merchant check: webhookUrl=${merchant?.webhookUrl ?? 'null'} hasSecret=${!!merchant?.callbackSecret} status=${merchant?.status}`)
  if (!merchant?.webhookUrl || !merchant?.callbackSecret) {
    console.warn(`[callback-retry] ${transactionId}: webhookUrl veya callbackSecret eksik — callback failed`)
    await db.update(transactions).set({ callbackStatus: 'failed', updatedAt: new Date() }).where(eq(transactions.id, transactionId))
    return
  }

  // 4a. Pasif merchant'a callback gönderme
  if (merchant.status !== 'active') {
    console.warn(`[callback-retry] ${transactionId}: merchant status=${merchant.status} — callback failed`)
    await db.update(transactions).set({ callbackStatus: 'failed', updatedAt: new Date() }).where(eq(transactions.id, transactionId))
    return
  }

  // 4b. SSRF koruması — production'da yalnızca HTTPS, private/loopback IP'ler yasaklı
  //     development modunda HTTP ve localhost'a izin verilir (local test kolaylığı)
  const isDev = env.NODE_ENV !== 'production'
  console.log(`[callback-retry] NODE_ENV=${env.NODE_ENV} isDev=${isDev}`)
  let webhookHostname: string
  try {
    const parsed = new URL(merchant.webhookUrl)
    console.log(`[callback-retry] URL parse OK protocol=${parsed.protocol} hostname=${parsed.hostname}`)
    if (!isDev && parsed.protocol !== 'https:') {
      console.warn(`[callback-retry] ${transactionId}: webhookUrl HTTPS değil — callback failed`)
      await db.update(transactions).set({ callbackStatus: 'failed', updatedAt: new Date() }).where(eq(transactions.id, transactionId))
      return
    }
    webhookHostname = parsed.hostname
  } catch {
    console.warn(`[callback-retry] ${transactionId}: webhookUrl geçersiz URL — callback failed`)
    await db.update(transactions).set({ callbackStatus: 'failed', updatedAt: new Date() }).where(eq(transactions.id, transactionId))
    return
  }
  const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1|localhost$)/i
  if (!isDev && PRIVATE_IP_RE.test(webhookHostname)) {
    console.warn(`[callback-retry] ${transactionId}: webhookUrl private/loopback adres — callback failed`)
    await db.update(transactions).set({ callbackStatus: 'failed', updatedAt: new Date() }).where(eq(transactions.id, transactionId))
    return
  }

  // 5. Mevcut deneme sayısını bul — sadece mevcut faza ait loglar
  // PROCESSING callback başarısızlıkları COMPLETED fazının retry bütçesini tüketmesin
  // updatedAt yerine status geçiş timestamp'i kullanılıyor (updatedAt playerConfirmed gibi
  // fazı değiştirmeyen güncellemelerle sıfırlanabilir ve attempt sayısını yanıltır)
  const phaseStartedAt =
    freshTx.status === 'PROCESSING'
      ? (freshTx.claimedAt   ?? freshTx.createdAt)
      : (freshTx.resolvedAt  ?? freshTx.claimedAt ?? freshTx.createdAt)
  const previousAttempts = await db.query.callbackLogs.findMany({
    where: and(eq(callbackLogs.transactionId, transactionId), gte(callbackLogs.sentAt, phaseStartedAt)),
  })
  const attemptNumber = previousAttempts.length + 1

  // 6. Payload oluştur (imzasız body önce hesaplanır, sonra signature eklenir)
  const timestamp = new Date().toISOString()
  const pa = (freshTx as any).paymentAccount as { accountNumber: string; name: string; bank: { name: string } | null } | null
  const basePayload = {
    txId:           freshTx.id,
    status:         freshTx.status,
    type:           freshTx.type,
    amount:         freshTx.amount,
    currency:       freshTx.currency,
    externalUserId: freshTx.externalUserId,
    // v1.1 userInfo — her callback'te aynı sabit sırada
    userInfo: {
      identityNumber: (freshTx as any).userIdentityNumber ?? '',
      memberId:       (freshTx as any).userMemberId ?? '',
      firstName:      (freshTx as any).userFirstName ?? '',
      middleName:     (freshTx as any).userMiddleName ?? '',
      lastName:       (freshTx as any).userLastName ?? '',
      phone:          (freshTx as any).userPhone ?? '',
    },
    timestamp,
    ...(freshTx.status === 'PROCESSING' && pa ? {
      depositAddress: pa.accountNumber,
      accountName:    pa.name,
      bankName:       pa.bank?.name ?? null,
    } : {}),
    ...((freshTx as any).revised ? {
      revision:       true,
      previousStatus: (freshTx as any).previousStatus,
      originalAmount: freshTx.amount,
    } : {}),
  }
  const baseBody = JSON.stringify(basePayload)

  // 7. HMAC imzası
  const hmacHex   = createHmac('sha256', merchant.callbackSecret).update(baseBody).digest('hex')
  const signature = `sha256=${hmacHex}`

  // signature alanı payload içine de eklenir (AC #2)
  const payload   = { ...basePayload, signature }
  const rawBody   = JSON.stringify(payload)

  console.log(`[callback-retry] HTTP POST gönderiliyor → ${merchant.webhookUrl} (deneme #${attemptNumber})`)

  // 8. HTTP POST — 10 saniye timeout
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 10_000)

  let responseStatus: number | null = null
  let responseBody:   string | null = null
  let success        = false
  let errorMessage:  string | null = null

  try {
    const response = await fetch(merchant.webhookUrl, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature':  signature,
      },
      body:   rawBody,
      signal: controller.signal,
    })

    responseStatus = response.status
    const raw      = await response.text()
    responseBody   = raw.slice(0, 500)
    success        = response.ok
  } catch (err: any) {
    errorMessage = err.name === 'AbortError'
      ? 'HTTP timeout (10s)'
      : (err.message ?? 'Network error')
  } finally {
    clearTimeout(timeoutId)
  }

  console.log(`[callback-retry] HTTP POST sonuç: status=${responseStatus} success=${success} error=${errorMessage ?? 'none'}`)

  // 9. Denemeyi logla
  await db.insert(callbackLogs).values({
    transactionId,
    attemptNumber,
    sentAt:         new Date(),
    responseStatus,
    responseBody,
    success,
    errorMessage,
  })

  // 10. Başarıysa callbackStatus güncelle ve bitir
  if (success) {
    await db
      .update(transactions)
      .set({ callbackStatus: 'sent', updatedAt: new Date() })
      .where(eq(transactions.id, transactionId))
    console.log(`[callback-retry] ${transactionId} callback başarıyla gönderildi (deneme #${attemptNumber})`)
    return
  }

  // 11. Son deneme ise callbackStatus = 'failed' set et, Error fırlatma
  if (attemptNumber >= MAX_ATTEMPTS) {
    await db
      .update(transactions)
      .set({ callbackStatus: 'failed', updatedAt: new Date() })
      .where(eq(transactions.id, transactionId))
    console.error(`[callback-retry] DEAD-LETTER: ${transactionId} tüm ${MAX_ATTEMPTS} deneme başarısız`)
    return
  }

  // 12. Başarısızsa Error fırlat → pg-boss retry mekanizması devreye girer
  const reason = errorMessage ?? `HTTP ${responseStatus}`
  console.warn(`[callback-retry] ${transactionId} deneme #${attemptNumber} başarısız: ${reason}`)
  throw new Error(`Callback başarısız: ${reason}`)
}
