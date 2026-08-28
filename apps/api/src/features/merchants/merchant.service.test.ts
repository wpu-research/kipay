import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => {
  return {
    db: {
      query:       { merchants: { findFirst: vi.fn() } },
      insert:      vi.fn(),
      update:      vi.fn(),
      transaction: vi.fn(),
    },
    merchants: {},
    eq:  vi.fn((col, val) => ({ col, val })),
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    sql: vi.fn((strings: TemplateStringsArray) => strings[0]),
  }
})

import { db } from '@panel/db'
import { merchantService } from './merchant.service.js'

const mockDb = db as unknown as {
  query:       { merchants: { findFirst: ReturnType<typeof vi.fn> } }
  insert:      ReturnType<typeof vi.fn>
  update:      ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
}

const TENANT_A  = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TENANT_B  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const MERCHANT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const mockMerchant = {
  id:             MERCHANT_ID,
  tenantId:       TENANT_A,
  merchantName:   'Test Merchant',
  webhookUrl:     'https://example.com/webhook',
  isSandbox:      true,
  status:         'active' as const,
  contactEmail:   null,
  contactPhone:   null,
  contactAddress: null,
  createdAt:      new Date('2026-01-01T00:00:00Z'),
  updatedAt:      new Date('2026-01-01T00:00:00Z'),
}

const createInput = {
  merchantName: 'Test Merchant',
  webhookUrl:   'https://example.com/webhook',
  isSandbox:    true,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('merchantService.createMerchant', () => {
  it('başarılı oluşturma — merchant döner', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(null)
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockMerchant]),
      }),
    })

    const result = await merchantService.createMerchant(TENANT_A, createInput)
    expect(result.merchantName).toBe('Test Merchant')
    expect(result.tenantId).toBe(TENANT_A)
  })

  it('aynı tenantId + merchantName çakışması → 409 MERCHANT_NAME_CONFLICT', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)

    await expect(
      merchantService.createMerchant(TENANT_A, createInput)
    ).rejects.toMatchObject({ code: 'MERCHANT_NAME_CONFLICT', statusCode: 409 })
  })

  it('farklı tenant, aynı ad → başarılı (izolasyon)', async () => {
    // TENANT_B için findFirst null döner (farklı tenant'ta çakışma yok)
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(null)
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...mockMerchant, tenantId: TENANT_B }]),
      }),
    })

    const result = await merchantService.createMerchant(TENANT_B, createInput)
    expect(result.tenantId).toBe(TENANT_B)
  })
})

describe('merchantService.getMerchants', () => {
  it('tenant izolasyonu — kendi tenant merchantları döner', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      // İkinci select çağrısı: data sorgusu
      const txWithOrder = {
        select: vi.fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 1 }]),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([mockMerchant]),
                  }),
                }),
              }),
            }),
          }),
      }
      return fn(txWithOrder)
    })

    const result = await merchantService.getMerchants(TENANT_A, 1, 20)
    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
  })
})

describe('merchantService.getMerchantById', () => {
  it('kendi tenant merchant → merchant döner', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(mockMerchant)

    const result = await merchantService.getMerchantById(TENANT_A, MERCHANT_ID)
    expect(result.id).toBe(MERCHANT_ID)
  })

  it('başka tenant → 404 NOT_FOUND', async () => {
    mockDb.query.merchants.findFirst.mockResolvedValueOnce(null)

    await expect(
      merchantService.getMerchantById(TENANT_B, MERCHANT_ID)
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

describe('merchantService.updateMerchantStatus', () => {
  it('active→inactive başarılı', async () => {
    const updated = { ...mockMerchant, status: 'inactive' as const }
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    })

    const result = await merchantService.updateMerchantStatus(TENANT_A, MERCHANT_ID, 'inactive')
    expect(result.status).toBe('inactive')
  })

  it('inactive→active başarılı', async () => {
    const updated = { ...mockMerchant, status: 'active' as const }
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    })

    const result = await merchantService.updateMerchantStatus(TENANT_A, MERCHANT_ID, 'active')
    expect(result.status).toBe('active')
  })

  it('var olmayan merchant → 404 NOT_FOUND', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    await expect(
      merchantService.updateMerchantStatus(TENANT_A, 'nonexistent-id', 'inactive')
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})
