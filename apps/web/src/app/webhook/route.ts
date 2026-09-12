/**
 * POST /webhook — panel işlem durumu değişince buraya POST atar.
 * apps/gateway/src/routes/webhook.ts'den taşındı.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { MERCHANT_CREDS, paymentEnv } from '@/lib/payment/env'
import { sseNotify } from '@/lib/payment/events'
import { getTxCreds, updateTransaction } from '@/lib/payment/panel-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface WebhookPayload {
  txId:            string
  status:          string
  externalUserId?: string
  amount?:         string
  currency?:       string
  type?:           string
  timestamp?:      string
  signature?:      string
  depositAddress?: string
  accountName?:    string
  bankName?:       string
}

export async function POST(request: NextRequest) {
  // HMAC doğrulaması ham gövde üzerinden yapılır — önce text olarak oku.
  const rawBody = await request.text()

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody) as WebhookPayload
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 })
  }
  if (!payload.txId || !payload.status) {
    return NextResponse.json({ error: 'txId ve status zorunlu' }, { status: 400 })
  }

  const requireSig = paymentEnv.WEBHOOK_REQUIRE_SIG === 'true'
  const sigToCheck = request.headers.get('x-signature') ?? payload.signature ?? undefined

  if (!sigToCheck) {
    if (requireSig) {
      console.warn(`[WEBHOOK] İmzasız istek reddedildi — txId=${payload.txId}`)
      return NextResponse.json({ error: 'Signature required' }, { status: 401 })
    }
    console.warn(`[WEBHOOK] İmzasız webhook kabul edildi — txId=${payload.txId}`)
  }

  if (sigToCheck) {
    try {
      const bodyDict = JSON.parse(rawBody) as Record<string, unknown>
      delete bodyDict['signature']
      const canonical = JSON.stringify(bodyDict)
      const incoming  = sigToCheck.startsWith('sha256=') ? sigToCheck : `sha256=${sigToCheck}`

      const txCreds = getTxCreds(payload.txId)
      const candidates: string[] = []
      if (txCreds?.cbSecret) candidates.push(txCreds.cbSecret)
      for (const creds of MERCHANT_CREDS.values()) {
        if (creds.cbSecret && !candidates.includes(creds.cbSecret)) candidates.push(creds.cbSecret)
      }

      let verified = false
      for (const secret of candidates) {
        const expected = 'sha256=' + createHmac('sha256', secret).update(canonical).digest('hex')
        try {
          verified = timingSafeEqual(Buffer.from(expected), Buffer.from(incoming))
        } catch { /* uzunluk farkı → eşit değil */ }
        if (verified) break
      }

      if (!verified) {
        console.warn(`[WEBHOOK] İmza geçersiz! txId=${payload.txId}`)
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
      console.info(`[WEBHOOK] İmza doğrulandı ✓ txId=${payload.txId}`)
    } catch (err) {
      console.warn(`[WEBHOOK] İmza doğrulama hatası: ${String(err)}`)
    }
  }

  let status = payload.status
  if (status === 'COMPLETED') status = 'APPROVED'
  if (status === 'FLAGGED') {
    console.warn(`[WEBHOOK] FLAGGED — txId=${payload.txId} manuel inceleme gerekiyor`)
  }

  console.info(`[WEBHOOK] txId=${payload.txId} status=${status} user=${payload.externalUserId} amount=${payload.amount}`)

  // PROCESSING webhook: hesap bilgisini de güncelle (v2 akışında claim anında gönderiliyor)
  const accountUpdates = payload.status === 'PROCESSING' && payload.depositAddress
    ? { ibanWallet: payload.depositAddress, accountName: payload.accountName, bank: payload.bankName ?? undefined }
    : {}
  updateTransaction(payload.txId, { status, ...accountUpdates })

  if (payload.externalUserId) {
    sseNotify(payload.externalUserId, {
      txId:     payload.txId,
      status,
      amount:   payload.amount,
      currency: payload.currency,
      type:     payload.type,
    })
  }

  if (status === 'TIMEOUT') {
    console.info(`[WEBHOOK] TIMEOUT — txId=${payload.txId} işlem süresi doldu`)
  }

  return NextResponse.json({ received: true })
}
