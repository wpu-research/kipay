import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { encryptSecret } from '../lib/secret-crypto.js'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      merchantApiKeys:     { findFirst: vi.fn() },
      nonces:              { findFirst: vi.fn() },
      merchantIpWhitelist: { findFirst: vi.fn() },
      tenants:             { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
  merchantApiKeys:     {},
  nonces:              {},
  merchantIpWhitelist: {},
  tenants:             {},
  eq:  vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
}))

import { db } from '@panel/db'
import { merchantAuth } from './merchant-hmac.js'

const mockApiKeysQuery      = (db.query as any).merchantApiKeys      as { findFirst: ReturnType<typeof vi.fn> }
const mockNoncesQuery       = (db.query as any).nonces               as { findFirst: ReturnType<typeof vi.fn> }
const mockWhitelistQuery    = (db.query as any).merchantIpWhitelist  as { findFirst: ReturnType<typeof vi.fn> }
const mockTenantsQuery      = (db.query as any).tenants               as { findFirst: ReturnType<typeof vi.fn> }

const validKeyId  = 'key_abc123'
const validSecret = 'sk_xyz789'

const validKeyRecord = {
  id:              'kid-1',
  keyId:           validKeyId,
  secretEncrypted: encryptSecret(validSecret),
  status:          'active',
  merchant: {
    id:       'mid-1',
    status:   'active',
    tenantId: 'tid-1',
  },
}

function validTimestamp() {
  return String(Math.floor(Date.now() / 1000))
}

function makeSignature(secret: string, timestamp: string, nonce: string, rawBody = '') {
  const canonical = `${timestamp}\n${nonce}\n${rawBody}`
  return createHmac('sha256', secret).update(canonical).digest('hex')
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  const ts    = validTimestamp()
  const nonce = 'nonce-' + Math.random()
  const body  = ''
  const sig   = makeSignature(validSecret, ts, nonce, body)
  return {
    headers: {
      'x-api-key':   validKeyId,
      'x-timestamp': ts,
      'x-nonce':     nonce,
      'x-signature': sig,
    },
    rawBody: body,
    ip: '1.2.3.4',
    ...overrides,
  } as any
}

describe('merchantAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Varsayılan mock'lar: geçerli key, nonce yok, whitelist yok
    mockApiKeysQuery.findFirst.mockResolvedValue(validKeyRecord)
    mockNoncesQuery.findFirst.mockResolvedValue(null)
    mockWhitelistQuery.findFirst.mockResolvedValue(null)
    mockTenantsQuery.findFirst.mockResolvedValue({ status: 'active' })
    ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) })
  })

  // ─── API Key testleri ────────────────────────────────────────────
  it('geçerli keyId → merchant ve merchantKey set edilir', async () => {
    const req = makeRequest()
    await expect(merchantAuth(req, {} as any)).resolves.toBeUndefined()
    expect(req.merchant).toMatchObject({ id: 'mid-1' })
    expect(req.merchantKey).toMatchObject({ keyId: validKeyId })
  })

  it('X-API-Key header eksik → UNAUTHORIZED (401)', async () => {
    const req = makeRequest({ headers: { ...makeRequest().headers, 'x-api-key': undefined } })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'UNAUTHORIZED', statusCode: 401,
    })
  })

  it('kolon İÇEREN eski format (keyId:secret) → INVALID_API_KEY (401)', async () => {
    const req = makeRequest({ headers: { ...makeRequest().headers, 'x-api-key': `${validKeyId}:sk_xyz789` } })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'INVALID_API_KEY', statusCode: 401,
    })
  })

  it('bilinmeyen keyId → DB kayıt null → INVALID_API_KEY (401)', async () => {
    mockApiKeysQuery.findFirst.mockResolvedValueOnce(null)
    const req = makeRequest({ headers: { ...makeRequest().headers, 'x-api-key': 'key_unknown' } })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'INVALID_API_KEY', statusCode: 401,
    })
  })

  it('pasif key (status=revoked) → INVALID_API_KEY (401)', async () => {
    mockApiKeysQuery.findFirst.mockResolvedValueOnce({ ...validKeyRecord, status: 'revoked' })
    const req = makeRequest()
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'INVALID_API_KEY', statusCode: 401,
    })
  })

  it('merchant aktif değilse → INVALID_API_KEY (401)', async () => {
    mockApiKeysQuery.findFirst.mockResolvedValueOnce({
      ...validKeyRecord,
      merchant: { ...validKeyRecord.merchant, status: 'inactive' },
    })
    const req = makeRequest()
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'INVALID_API_KEY', statusCode: 401,
    })
  })

  it('tenant izolasyonu: farklı tenant keyi doğrulanmaz (DB zaten null döner)', async () => {
    mockApiKeysQuery.findFirst.mockResolvedValueOnce(null)
    const req = makeRequest()
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'INVALID_API_KEY',
    })
  })

  // ─── Timestamp testleri ──────────────────────────────────────────
  it('X-Timestamp header eksik → REQUEST_EXPIRED (401)', async () => {
    const req = makeRequest({ headers: { ...makeRequest().headers, 'x-timestamp': undefined } })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'REQUEST_EXPIRED', statusCode: 401,
    })
  })

  it('X-Timestamp 5 dakikadan eski → REQUEST_EXPIRED (401)', async () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 6 * 60)  // 6 dk önce
    const req   = makeRequest({ headers: { ...makeRequest().headers, 'x-timestamp': oldTs } })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'REQUEST_EXPIRED', statusCode: 401,
    })
  })

  it('X-Timestamp NaN → REQUEST_EXPIRED (401)', async () => {
    const req = makeRequest({ headers: { ...makeRequest().headers, 'x-timestamp': 'notanumber' } })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'REQUEST_EXPIRED', statusCode: 401,
    })
  })

  // ─── Nonce testleri ──────────────────────────────────────────────
  it('X-Nonce header eksik → NONCE_REPLAY (401)', async () => {
    const req = makeRequest({ headers: { ...makeRequest().headers, 'x-nonce': undefined } })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'NONCE_REPLAY', statusCode: 401,
    })
  })

  it('X-Nonce DB\'de mevcut → NONCE_REPLAY (401)', async () => {
    mockNoncesQuery.findFirst.mockResolvedValueOnce({ nonce: 'used', keyId: 'k', expiresAt: new Date() })
    const req = makeRequest()
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'NONCE_REPLAY', statusCode: 401,
    })
  })

  it('X-Nonce yeni → DB\'ye kaydedilir', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    ;(db.insert as ReturnType<typeof vi.fn>).mockReturnValueOnce({ values: insertValues })
    const req = makeRequest()
    await merchantAuth(req, {} as any)
    expect(db.insert).toHaveBeenCalledOnce()
    expect(insertValues).toHaveBeenCalledOnce()
  })

  // ─── HMAC testleri ───────────────────────────────────────────────
  it('X-Signature header eksik → INVALID_SIGNATURE (401)', async () => {
    const req = makeRequest({ headers: { ...makeRequest().headers, 'x-signature': undefined } })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'INVALID_SIGNATURE', statusCode: 401,
    })
  })

  it('X-Signature geçersiz → INVALID_SIGNATURE (401)', async () => {
    const req = makeRequest({ headers: { ...makeRequest().headers, 'x-signature': 'deadbeef'.repeat(8) } })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'INVALID_SIGNATURE', statusCode: 401,
    })
  })

  it('X-Signature geçerli → başarı', async () => {
    const req = makeRequest()
    await expect(merchantAuth(req, {} as any)).resolves.toBeUndefined()
  })

  // ─── IP whitelist testleri ───────────────────────────────────────
  it('whitelist boş → herkese izin', async () => {
    mockWhitelistQuery.findFirst.mockResolvedValue(null)
    mockTenantsQuery.findFirst.mockResolvedValue({ status: 'active' })
    const req = makeRequest({ ip: '9.9.9.9' })
    await expect(merchantAuth(req, {} as any)).resolves.toBeUndefined()
  })

  it('whitelist aktif + istek IP listede → başarı', async () => {
    // İlk çağrı: whitelist var mı? → var
    // İkinci çağrı: bu IP listede mi? → var
    mockWhitelistQuery.findFirst
      .mockResolvedValueOnce({ id: 'w1', merchantId: 'mid-1', ipAddress: '1.2.3.4' })
      .mockResolvedValueOnce({ id: 'w1', merchantId: 'mid-1', ipAddress: '1.2.3.4' })
    const req = makeRequest({ ip: '1.2.3.4' })
    await expect(merchantAuth(req, {} as any)).resolves.toBeUndefined()
  })

  it('whitelist aktif + istek IP listede değil → IP_NOT_WHITELISTED (403)', async () => {
    // İlk çağrı: whitelist var mı? → var; ikinci çağrı: IP listede mi? → yok
    mockWhitelistQuery.findFirst
      .mockResolvedValueOnce({ id: 'w1', merchantId: 'mid-1', ipAddress: '1.2.3.4' })
      .mockResolvedValueOnce(null)
    const req = makeRequest({ ip: '5.5.5.5' })
    await expect(merchantAuth(req, {} as any)).rejects.toMatchObject({
      code: 'IP_NOT_WHITELISTED', statusCode: 403,
    })
  })

  // ─── Tam happy path ──────────────────────────────────────────────
  it('tüm headers geçerli → merchant ve merchantKey set edilir', async () => {
    const req = makeRequest()
    await merchantAuth(req, {} as any)
    expect(req.merchant).toMatchObject({ id: 'mid-1', status: 'active' })
    expect(req.merchantKey).toMatchObject({ keyId: validKeyId, status: 'active' })
  })
})
