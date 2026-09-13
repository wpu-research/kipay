/**
 * Ödeme oturum token'ı — merchant kullanıcı bilgisini (KYC) URL'de açık taşımak
 * yerine opak, şifreli ve süreli bir token içinde taşır.
 *
 * Merchant backend'i POST /api/payment/session ile PII gönderir, token alır;
 * widget URL'inde yalnızca ?s=<token> görünür. /api/payment/account token'ı çözer.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { paymentEnv, MERCHANT_CREDS } from './env'

function tokenKey(): Buffer {
  // Sabit bir anahtar gerekir (instance'lar/redeploy arası tutarlı olsun diye).
  const raw =
    process.env.PAYMENT_TOKEN_SECRET ||
    paymentEnv.CALLBACK_SECRET ||
    [...MERCHANT_CREDS.values()][0]?.cbSecret ||
    'kipay-dev-token-secret-change-me'
  return scryptSync(raw, 'kipay-payment-session', 32)
}

export interface SessionPayload {
  merchantId:     string
  userId:         string
  identityNumber: string
  firstName:      string
  lastName:       string
  phone:          string
  exp:            number  // epoch ms
}

export function encryptSession(data: Omit<SessionPayload, 'exp'>, ttlMs = 15 * 60 * 1000): string {
  const payload: SessionPayload = { ...data, exp: Date.now() + ttlMs }
  const iv     = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv)
  const enc    = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  // iv.tag.ciphertext (base64url)
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`
}

export function decryptSession(token: string): SessionPayload | null {
  try {
    const [ivB, tagB, dataB] = token.split('.')
    if (!ivB || !tagB || !dataB) return null
    const decipher = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivB, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagB, 'base64url'))
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()])
    const payload = JSON.parse(dec.toString('utf8')) as SessionPayload
    if (!payload.exp || Date.now() > payload.exp) return null  // süresi dolmuş
    return payload
  } catch {
    return null
  }
}
