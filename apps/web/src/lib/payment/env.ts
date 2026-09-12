/**
 * Ödeme sayfası (www.kipayz.com/odeme) — merchant credential yönetimi.
 * apps/gateway/src/config/env.ts'den taşındı.
 *
 * Merchant tanımı env'de: MERCHANT_1={"id":"...","keyId":"...","secret":"...","cbSecret":"...","origin":"https://www.kipayz.com"}
 */

export const paymentEnv = {
  // Panel API adresi. Projedeki kalıba uyar (bkz. app/(dashboard)/layout.tsx):
  // sunucudan sunucuya çağrı olduğu için önce Railway iç adresi denenir.
  // Üçü de boşsa panel-api mock moda düşer.
  PANEL_BASE_URL:      process.env.PANEL_BASE_URL
                    ?? process.env.API_INTERNAL_URL
                    ?? process.env.NEXT_PUBLIC_API_URL
                    ?? '',
  MERCHANT_ID:         process.env.MERCHANT_ID ?? '',
  API_KEY_ID:          process.env.API_KEY_ID ?? '',
  API_SECRET:          process.env.API_SECRET ?? '',
  CALLBACK_SECRET:     process.env.CALLBACK_SECRET ?? '',
  ALERT_WEBHOOK_URL:   process.env.ALERT_WEBHOOK_URL ?? '',
  WEBHOOK_REQUIRE_SIG: process.env.WEBHOOK_REQUIRE_SIG ?? 'false',
}

export interface MerchantCreds {
  keyId:         string
  secret:        string
  cbSecret:      string
  originPattern: string
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

export function matchesOrigin(pattern: string, origin: string): boolean {
  if (!pattern) return false
  try { return wildcardToRegex(pattern).test(origin) } catch { return false }
}

export function loadMerchantCreds(): Map<string, MerchantCreds> {
  const map = new Map<string, MerchantCreds>()
  for (let i = 1; i <= 20; i++) {
    const raw = (process.env[`MERCHANT_${i}`] ?? '').trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as {
        id: string; keyId: string; secret: string; cbSecret?: string; origin?: string
      }
      if (!parsed.id || !parsed.keyId || !parsed.secret) {
        console.warn(`[MERCHANT] MERCHANT_${i} eksik alan içeriyor, atlanıyor.`)
        continue
      }
      map.set(parsed.id, {
        keyId:         parsed.keyId,
        secret:        parsed.secret,
        cbSecret:      parsed.cbSecret ?? '',
        originPattern: parsed.origin   ?? '',
      })
    } catch {
      console.warn(`[MERCHANT] MERCHANT_${i} geçersiz JSON, atlanıyor.`)
    }
  }
  if (map.size === 0) {
    console.warn("[MERCHANT] Merchant tanımlanmamış (MERCHANT_1, MERCHANT_2 vb.)")
  }
  return map
}

/** Modül seviyesinde tek sefer yüklenir. */
export const MERCHANT_CREDS = loadMerchantCreds()
