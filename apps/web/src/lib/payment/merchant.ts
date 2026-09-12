/**
 * Ödeme uçları için ortak yardımcılar (merchant doğrulama, alert).
 */
import { MERCHANT_CREDS, matchesOrigin, paymentEnv, type MerchantCreds } from '@/lib/payment/env'

export type MerchantCheck =
  | { ok: true;  creds: MerchantCreds }
  | { ok: false; status: number; error: string }

export function checkMerchant(merchantId: string, origin: string): MerchantCheck {
  const creds = MERCHANT_CREDS.get(merchantId)
  if (!creds) {
    console.warn(`[MERCHANT] Bilinmeyen merchant_id: ${merchantId}`)
    return { ok: false, status: 403, error: 'Bilinmeyen merchant.' }
  }
  if (creds.originPattern && !matchesOrigin(creds.originPattern, origin)) {
    console.warn(`[MERCHANT] Origin reddedildi: ${origin} (beklenen: ${creds.originPattern})`)
    return { ok: false, status: 403, error: 'İzin verilmeyen origin.' }
  }
  return { ok: true, creds }
}

export function alertNoAccount(merchantId: string, amount: number | string) {
  if (!paymentEnv.ALERT_WEBHOOK_URL) return
  fetch(paymentEnv.ALERT_WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      event:       'NO_AVAILABLE_ACCOUNT',
      merchant_id: merchantId,
      amount:      String(amount),
      message:     'Ödeme hesapları dolu veya limit aşıldı.',
    }),
  }).catch(() => {})
}
