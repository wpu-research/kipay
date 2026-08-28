import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => {
  return {
    db: {
      query: {
        merchants:           { findFirst: vi.fn() },
        merchantApiKeys:     { findMany: vi.fn() },
        merchantIpWhitelist: { findMany: vi.fn() },
      },
      insert:  vi.fn(),
      update:  vi.fn(),
      delete:  vi.fn(),
    },
    merchants:           {},
    merchantApiKeys:     {},
    merchantIpWhitelist: {},
    eq:  vi.fn((col, val) => ({ col, val })),
    and: vi.fn((...args: unknown[]) => ({ and: args })),
  }
})

import { db } from '@panel/db'
import { merchantApiKeyService } from './merchant-api-key.service.js'

const mockDb = db as unknown as {
  query: {
    merchants:           { findFirst: ReturnType<typeof vi.fn> }
    merchantApiKeys:     { findMany: ReturnType<typeof vi.fn> }
    merchantIpWhitelist: { findMany: ReturnType<typeof vi.fn> }
  }
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const TENANT_A    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TENANT_B    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const MERCHANT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const KEY_ID      = 'key_abcdef1234567890'

const mockMerchant = { id: MERCHANT_ID, tenantId: TENANT_A }

const mockApiKey = {
  id:         'dddddddd-dddd-dddd-dddd-dddddddddddd',
  merchantId: MERCHANT_ID,
  tenantId:   TENANT_A,
  keyId:      KEY_ID,
  secretEncrypted: 'iv:tag:cipher',
  label:      null,
  status:     'active' as const,
  revokedAt:  null,
  createdAt:  new Date('2026-01-01T00:00:00Z'),
  updatedAt:  new Date('2026-01-01T00:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
})

// --- createApiKey ---

describe('merchantApiKeyService.createApiKey', () => {
  it('başarılı oluşturma — { keyId, secret } döner, secret plaintext', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockApiKey]),
      }),
    })

    const result = await merchantApiKeyService.createApiKey(TENANT_A, MERCHANT_ID, {})

    expect(result.keyId).toMatch(/^key_/)
    expect(result.secret).toMatch(/^sk_/)
    expect(result.secret).not.toBe('sk_***...***')
    expect(result.merchantId).toBe(MERCHANT_ID)
  })

  it('secret DB de düz saklanmaz — secretEncrypted farklı', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    let capturedValues: Record<string, unknown> | null = null
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        capturedValues = vals
        return { returning: vi.fn().mockResolvedValue([mockApiKey]) }
      }),
    })

    const result = await merchantApiKeyService.createApiKey(TENANT_A, MERCHANT_ID, {})

    expect(capturedValues).not.toBeNull()
    expect((capturedValues as Record<string, unknown>).secretEncrypted).toBeDefined()
    expect((capturedValues as Record<string, unknown>).secretEncrypted).not.toBe(result.secret)
  })

  it('başka tenant\'ın merchant\'ına ekleme — 404 NOT_FOUND', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(null)

    await expect(
      merchantApiKeyService.createApiKey(TENANT_B, MERCHANT_ID, {})
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

// --- getApiKeys ---

describe('merchantApiKeyService.getApiKeys', () => {
  it('liste — secret alanı dönmüyor', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    mockDb.query.merchantApiKeys.findMany.mockResolvedValueOnce([mockApiKey])

    const result = await merchantApiKeyService.getApiKeys(TENANT_A, MERCHANT_ID)

    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('secret')
  })

  it('başka tenant\'ın merchant\'ı — 404', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(null)

    await expect(
      merchantApiKeyService.getApiKeys(TENANT_B, MERCHANT_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

// --- revokeApiKey ---

describe('merchantApiKeyService.revokeApiKey', () => {
  it('aktif key — revoked olur', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    const revokedKey = { ...mockApiKey, status: 'revoked' as const, revokedAt: new Date() }
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([revokedKey]),
        }),
      }),
    })

    const result = await merchantApiKeyService.revokeApiKey(TENANT_A, MERCHANT_ID, KEY_ID)

    expect(result.status).toBe('revoked')
    expect(result).not.toHaveProperty('secret')
  })

  it('zaten revoked veya mevcut değil key — 404', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    await expect(
      merchantApiKeyService.revokeApiKey(TENANT_A, MERCHANT_ID, KEY_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('başka tenant — 404', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(null)

    await expect(
      merchantApiKeyService.revokeApiKey(TENANT_B, MERCHANT_ID, KEY_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

// --- rotateApiKey ---

describe('merchantApiKeyService.rotateApiKey', () => {
  it('yeni secret döner (plaintext), keyId aynı kalır', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockApiKey]),
        }),
      }),
    })

    const result = await merchantApiKeyService.rotateApiKey(TENANT_A, MERCHANT_ID, KEY_ID)

    expect(result.secret).toMatch(/^sk_/)
    expect(result.secret).not.toBe('sk_***...***')
    expect(result.keyId).toBe(KEY_ID)
  })

  it('secretEncrypted güncellendi — yeni secret ile farklı', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    let setValues: Record<string, unknown> | null = null
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
        setValues = vals
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockApiKey]),
          }),
        }
      }),
    })

    const result = await merchantApiKeyService.rotateApiKey(TENANT_A, MERCHANT_ID, KEY_ID)

    expect(setValues).not.toBeNull()
    expect((setValues as Record<string, unknown>).secretEncrypted).toBeDefined()
    expect((setValues as Record<string, unknown>).secretEncrypted).not.toBe(result.secret)
  })

  it('revoked key — 404', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    await expect(
      merchantApiKeyService.rotateApiKey(TENANT_A, MERCHANT_ID, KEY_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

// --- addIp ---

describe('merchantApiKeyService.addIp', () => {
  const IP = '192.168.1.100'
  const mockIpEntry = {
    id:         'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    merchantId: MERCHANT_ID,
    tenantId:   TENANT_A,
    ipAddress:  IP,
    createdAt:  new Date('2026-01-01T00:00:00Z'),
  }

  it('yeni IP eklendi', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockIpEntry]),
      }),
    })

    const result = await merchantApiKeyService.addIp(TENANT_A, MERCHANT_ID, IP)

    expect(result.ipAddress).toBe(IP)
    expect(result.merchantId).toBe(MERCHANT_ID)
  })

  it('aynı IP tekrar — 409 IP_ALREADY_EXISTS', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue({ code: '23505' }),
      }),
    })

    await expect(
      merchantApiKeyService.addIp(TENANT_A, MERCHANT_ID, IP)
    ).rejects.toMatchObject({ code: 'IP_ALREADY_EXISTS', statusCode: 409 })
  })

  it('başka tenant\'ın merchant\'ı — 404', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(null)

    await expect(
      merchantApiKeyService.addIp(TENANT_B, MERCHANT_ID, IP)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

// --- removeIp ---

describe('merchantApiKeyService.removeIp', () => {
  const IP = '192.168.1.100'
  const mockIpEntry = {
    id:         'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    merchantId: MERCHANT_ID,
    tenantId:   TENANT_A,
    ipAddress:  IP,
    createdAt:  new Date('2026-01-01T00:00:00Z'),
  }

  it('var olan IP — silindi', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    mockDb.delete.mockReturnValueOnce({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockIpEntry]),
      }),
    })

    await expect(
      merchantApiKeyService.removeIp(TENANT_A, MERCHANT_ID, IP)
    ).resolves.toBeUndefined()
  })

  it('olmayan IP — 404', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)
    mockDb.delete.mockReturnValueOnce({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    })

    await expect(
      merchantApiKeyService.removeIp(TENANT_A, MERCHANT_ID, IP)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})
