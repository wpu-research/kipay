import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, merchantApiKeys, merchantIpWhitelist, nonces, tenants, eq, and } from '@panel/db'
import { AppError } from '../errors/app-error.js'
import { decryptSecret } from '../lib/secret-crypto.js'
import type { FastifyRequest, FastifyReply } from 'fastify'

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000  // 5 dakika

// v1.1 — X-API-Key SADECE keyId taşır (secret ağda dolaşmaz).
// Secret DB'de şifreli durur; keyId ile kaydı bulup çözer, HMAC'i onunla doğrularız.
// İki nokta içeren eski format ("keyId:secret") reddedilir.
function parseApiKey(rawKey: string): { keyId: string } | null {
  if (rawKey.includes(':')) return null   // eski keyId:secret formatı artık geçersiz
  const keyId = rawKey.trim()
  if (!keyId) return null
  return { keyId }
}

// X-Signature "sha256=" önekiyle veya öneksiz gelebilir; ikisini de kabul et.
function stripSigPrefix(sig: string): string {
  return sig.startsWith('sha256=') ? sig.slice('sha256='.length) : sig
}

function verifyHmac(secret: string, timestamp: string, nonce: string, rawBody: string, signature: string): boolean {
  const canonical = `${timestamp}\n${nonce}\n${rawBody}`
  const expected  = createHmac('sha256', secret).update(canonical).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(stripSigPrefix(signature), 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export async function merchantAuth(request: FastifyRequest, _reply: FastifyReply) {
  // 1. API Key doğrulaması
  const rawKey = request.headers['x-api-key'] as string | undefined
  if (!rawKey) throw new AppError('UNAUTHORIZED', 'API key gerekli.', 401)

  const parsed = parseApiKey(rawKey)
  if (!parsed) throw new AppError('INVALID_API_KEY', 'X-API-Key yalnızca keyId taşımalı (secret gönderilmez).', 401)

  const { keyId } = parsed

  const keyRecord = await db.query.merchantApiKeys.findFirst({
    where: eq(merchantApiKeys.keyId, keyId),
    with: { merchant: true },
  })

  if (!keyRecord || keyRecord.status !== 'active') {
    throw new AppError('INVALID_API_KEY', 'Geçersiz veya pasif API key.', 401)
  }

  // Secret'ı çöz — HMAC doğrulaması için ham secret gerekli
  let secret: string
  try {
    secret = decryptSecret(keyRecord.secretEncrypted)
  } catch {
    throw new AppError('INVALID_API_KEY', 'API key secret çözülemedi.', 401)
  }

  if (keyRecord.merchant.status !== 'active') {
    throw new AppError('INVALID_API_KEY', 'Merchant aktif değil.', 401)
  }

  // Tenant aktif kontrolü
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, keyRecord.merchant.tenantId),
    columns: { status: true },
  })
  if (!tenant || tenant.status !== 'active') {
    throw new AppError('INVALID_API_KEY', 'Tenant aktif değil.', 401)
  }

  // 2. Timestamp doğrulaması
  const timestampHeader = request.headers['x-timestamp'] as string | undefined
  if (!timestampHeader) throw new AppError('REQUEST_EXPIRED', 'X-Timestamp header gerekli.', 401)

  // v1.1 spec ISO 8601 kullanır (örn. 2026-08-28T10:00:00.000Z).
  // Geriye uyumluluk için epoch-saniye de kabul edilir.
  let requestTime: number
  if (/^\d+$/.test(timestampHeader.trim())) {
    requestTime = parseInt(timestampHeader, 10) * 1000  // epoch saniye
  } else {
    requestTime = Date.parse(timestampHeader)           // ISO 8601
  }
  if (isNaN(requestTime) || Math.abs(Date.now() - requestTime) > TIMESTAMP_WINDOW_MS) {
    throw new AppError('REQUEST_EXPIRED', 'İstek süresi dolmuş, gelecek tarihli veya geçersiz format (5 dakika penceresi).', 401)
  }

  // 3. Nonce başlık kontrolü
  const nonceHeader = request.headers['x-nonce'] as string | undefined
  if (!nonceHeader) throw new AppError('NONCE_REPLAY', 'X-Nonce header gerekli.', 401)

  // 4. HMAC doğrulaması
  const signature = request.headers['x-signature'] as string | undefined
  if (!signature) throw new AppError('INVALID_SIGNATURE', 'X-Signature header gerekli.', 401)

  const rawBody = (request as any).rawBody as string ?? ''
  if (!verifyHmac(secret, timestampHeader, nonceHeader, rawBody, signature)) {
    throw new AppError('INVALID_SIGNATURE', 'İmza doğrulaması başarısız.', 401)
  }

  // 5. IP whitelist kontrolü (nonce tüketiminden önce — IP reddinde nonce'u yakma)
  const clientIp = request.ip.trim().toLowerCase()  // normalize (IPv6 lowercase vs stored)
  const whitelistEntry = await db.query.merchantIpWhitelist.findFirst({
    where: eq(merchantIpWhitelist.merchantId, keyRecord.merchant.id),
  })
  if (whitelistEntry) {
    // En az bir kayıt var → whitelist aktif; istek IP'si kontrol edilmeli
    const allowed = await db.query.merchantIpWhitelist.findFirst({
      where: and(
        eq(merchantIpWhitelist.merchantId, keyRecord.merchant.id),
        eq(merchantIpWhitelist.ipAddress, clientIp),
      ),
    })
    if (!allowed) throw new AppError('IP_NOT_WHITELISTED', 'Bu IP adresine izin verilmiyor.', 403)
  }

  // 6. Nonce atomik kayıt — IP kontrolü geçtikten sonra tüket
  const expiresAt = new Date(requestTime + TIMESTAMP_WINDOW_MS)
  try {
    const [inserted] = await db.insert(nonces).values({ nonce: nonceHeader, keyId, expiresAt }).returning()
    if (!inserted) throw new AppError('NONCE_REPLAY', 'Bu nonce daha önce kullanılmış.', 401)
  } catch (err) {
    if (err instanceof AppError) throw err
    if ((err as { code?: string }).code === '23505') throw new AppError('NONCE_REPLAY', 'Bu nonce daha önce kullanılmış.', 401)
    throw err
  }

  ;(request as any).merchant    = keyRecord.merchant
  ;(request as any).merchantKey = keyRecord
}
