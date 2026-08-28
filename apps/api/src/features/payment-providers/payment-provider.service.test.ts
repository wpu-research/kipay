import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => {
  return {
    db: {
      insert:      vi.fn(),
      update:      vi.fn(),
      transaction: vi.fn(),
    },
    paymentProviders:          {},
    paymentProviderCategories: {},
    eq:  vi.fn((col, val) => ({ col, val })),
    and: vi.fn((...args: unknown[]) => ({ and: args })),
    sql: vi.fn((strings: TemplateStringsArray) => strings[0]),
  }
})

import { db } from '@panel/db'
import { paymentProviderService } from './payment-provider.service.js'

const mockDb = db as unknown as {
  insert:      ReturnType<typeof vi.fn>
  update:      ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
}

const TENANT_A    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TENANT_B    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const PROVIDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const CATEGORY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const mockProvider = {
  id:        PROVIDER_ID,
  tenantId:  TENANT_A,
  name:      'Test Sağlayıcı',
  status:    'active' as const,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const mockCategory = {
  id:        CATEGORY_ID,
  tenantId:  TENANT_A,
  name:      'Havale',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
})

// --- createProvider ---

describe('paymentProviderService.createProvider', () => {
  it('başarılı oluşturma → provider döner, status active', async () => {
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockProvider]),
      }),
    })

    const result = await paymentProviderService.createProvider(TENANT_A, { name: 'Test Sağlayıcı' })
    expect(result.name).toBe('Test Sağlayıcı')
    expect(result.status).toBe('active')
    expect(result.tenantId).toBe(TENANT_A)
  })

  it('aynı ad aynı tenant → 409 PROVIDER_NAME_CONFLICT', async () => {
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue({ code: '23505' }),
      }),
    })

    await expect(
      paymentProviderService.createProvider(TENANT_A, { name: 'Test Sağlayıcı' })
    ).rejects.toMatchObject({ code: 'PROVIDER_NAME_CONFLICT', statusCode: 409 })
  })

  it('farklı tenant, aynı ad → başarılı (izolasyon)', async () => {
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...mockProvider, tenantId: TENANT_B }]),
      }),
    })

    const result = await paymentProviderService.createProvider(TENANT_B, { name: 'Test Sağlayıcı' })
    expect(result.tenantId).toBe(TENANT_B)
  })
})

// --- getProviders ---

describe('paymentProviderService.getProviders', () => {
  it('sayfalı liste → { data, meta }', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
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
                    offset: vi.fn().mockResolvedValue([mockProvider]),
                  }),
                }),
              }),
            }),
          }),
      }
      return fn(tx)
    })

    const result = await paymentProviderService.getProviders(TENANT_A, 1, 20)
    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
    expect(result.meta.page).toBe(1)
    expect(result.meta.limit).toBe(20)
  })

  it('boş liste → data: [], meta.total: 0', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 0 }]),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([]),
                  }),
                }),
              }),
            }),
          }),
      }
      return fn(tx)
    })

    const result = await paymentProviderService.getProviders(TENANT_A, 1, 20)
    expect(result.data).toHaveLength(0)
    expect(result.meta.total).toBe(0)
  })
})

// --- updateProvider ---

describe('paymentProviderService.updateProvider', () => {
  it('ad güncelleme → güncellenen provider döner', async () => {
    const updated = { ...mockProvider, name: 'Yeni Ad' }
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    })

    const result = await paymentProviderService.updateProvider(TENANT_A, PROVIDER_ID, { name: 'Yeni Ad' })
    expect(result.name).toBe('Yeni Ad')
  })

  it('status güncelleme → güncellenen provider döner', async () => {
    const updated = { ...mockProvider, status: 'inactive' as const }
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    })

    const result = await paymentProviderService.updateProvider(TENANT_A, PROVIDER_ID, { status: 'inactive' })
    expect(result.status).toBe('inactive')
  })

  it('başka tenant\'ın kaydı → 404 NOT_FOUND', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    await expect(
      paymentProviderService.updateProvider(TENANT_B, PROVIDER_ID, { name: 'X' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('mevcut olmayan id → 404 NOT_FOUND', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    await expect(
      paymentProviderService.updateProvider(TENANT_A, 'ffffffff-ffff-ffff-ffff-ffffffffffff', { name: 'X' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('ad çakışması → 409 PROVIDER_NAME_CONFLICT', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({ code: '23505' }),
        }),
      }),
    })

    await expect(
      paymentProviderService.updateProvider(TENANT_A, PROVIDER_ID, { name: 'Mevcut Ad' })
    ).rejects.toMatchObject({ code: 'PROVIDER_NAME_CONFLICT', statusCode: 409 })
  })
})

// --- createCategory ---

describe('paymentProviderService.createCategory', () => {
  it('başarılı oluşturma → category döner', async () => {
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockCategory]),
      }),
    })

    const result = await paymentProviderService.createCategory(TENANT_A, { name: 'Havale' })
    expect(result.name).toBe('Havale')
    expect(result.tenantId).toBe(TENANT_A)
  })

  it('aynı ad aynı tenant → 409 CATEGORY_NAME_CONFLICT', async () => {
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue({ code: '23505' }),
      }),
    })

    await expect(
      paymentProviderService.createCategory(TENANT_A, { name: 'Havale' })
    ).rejects.toMatchObject({ code: 'CATEGORY_NAME_CONFLICT', statusCode: 409 })
  })
})

// --- getCategories ---

describe('paymentProviderService.getCategories', () => {
  it('sayfalı liste → { data, meta }', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 2 }]),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue([mockCategory, { ...mockCategory, id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', name: 'Kripto' }]),
                  }),
                }),
              }),
            }),
          }),
      }
      return fn(tx)
    })

    const result = await paymentProviderService.getCategories(TENANT_A, 1, 20)
    expect(result.data).toHaveLength(2)
    expect(result.meta.total).toBe(2)
  })
})

// --- updateCategory ---

describe('paymentProviderService.updateCategory', () => {
  it('başarılı güncelleme → güncellenen category döner', async () => {
    const updated = { ...mockCategory, name: 'EFT' }
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updated]),
        }),
      }),
    })

    const result = await paymentProviderService.updateCategory(TENANT_A, CATEGORY_ID, { name: 'EFT' })
    expect(result.name).toBe('EFT')
  })

  it('başka tenant → 404 NOT_FOUND', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    await expect(
      paymentProviderService.updateCategory(TENANT_B, CATEGORY_ID, { name: 'EFT' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})
