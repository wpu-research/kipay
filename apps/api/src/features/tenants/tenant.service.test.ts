import { describe, it, expect, vi, beforeEach } from 'vitest'

// @panel/db mock
vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
  },
  tenants: {},
  eq: vi.fn((col, val) => ({ col, val })),
  sql: vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

import { db } from '@panel/db'
import { tenantService } from './tenant.service.js'

const mockDbQuery = db.query as unknown as {
  tenants: { findFirst: ReturnType<typeof vi.fn> }
}

// transaction mock yardımcısı — callback'i mock tx ile çağırır
function mockTransaction(txSetup: (tx: { select: ReturnType<typeof vi.fn> }) => void) {
  vi.mocked(db.transaction).mockImplementationOnce(async (fn) => {
    const tx = { select: vi.fn() }
    txSetup(tx)
    return fn(tx as never)
  })
}

const mockTenant = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Test Casino',
  slug: 'test-casino',
  status: 'active' as const,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

describe('tenantService.createTenant', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('benzersiz slug ile tenant oluşturur', async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([mockTenant]),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    const result = await tenantService.createTenant({ name: 'Test Casino', slug: 'test-casino' })
    expect(result).toEqual(mockTenant)
  })

  it('DB unique constraint hatası → TENANT_SLUG_CONFLICT (409) — P-4 constraint ismi kontrolü', async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValueOnce({ code: '23505', constraint: 'tenants_slug_unique' }),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    await expect(
      tenantService.createTenant({ name: 'Test Casino 2', slug: 'test-casino' })
    ).rejects.toMatchObject({
      code: 'TENANT_SLUG_CONFLICT',
      statusCode: 409,
    })
  })

  it('Başka unique constraint ihlali TENANT_SLUG_CONFLICT olarak dönemez — P-4', async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      // Farklı kısıt adı — slug değil başka bir unique constraint
      returning: vi.fn().mockRejectedValueOnce({ code: '23505', constraint: 'tenants_other_unique' }),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    // Raw DB hata fırlatılır (AppError'a dönüştürülmez) — TENANT_SLUG_CONFLICT olmaz
    await expect(
      tenantService.createTenant({ name: 'Test Casino 3', slug: 'test-casino-3' })
    ).rejects.not.toMatchObject({ code: 'TENANT_SLUG_CONFLICT' })
  })
})

describe('tenantService.updateTenant', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('mevcut tenant güncellenir', async () => {
    const updated = { ...mockTenant, name: 'Updated Casino' }
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(mockTenant)
    const mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([updated]),
    }
    vi.mocked(db.update).mockReturnValueOnce(mockUpdate as never)

    const result = await tenantService.updateTenant(mockTenant.id, { name: 'Updated Casino' })
    expect(result).toEqual(updated)
  })

  it('mevcut olmayan id için NOT_FOUND (404) fırlatır', async () => {
    // P-3 (CR-6): findFirst kaldırıldı — returning() boş dizisi NOT_FOUND tetikler
    const mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([]),
    }
    vi.mocked(db.update).mockReturnValueOnce(mockUpdate as never)

    await expect(
      tenantService.updateTenant('nonexistent-id', { name: 'X' })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })

  it('returning() boş dönerse NOT_FOUND fırlatır — P-4 eş zamanlı silme koruması', async () => {
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(mockTenant)
    const mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([]), // boş → tenant arada silindi
    }
    vi.mocked(db.update).mockReturnValueOnce(mockUpdate as never)

    await expect(
      tenantService.updateTenant(mockTenant.id, { name: 'X' })
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })

  it('DB unique constraint hatası → TENANT_SLUG_CONFLICT (409) — P-4 constraint ismi kontrolü', async () => {
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(mockTenant)
    const mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValueOnce({ code: '23505', constraint: 'tenants_slug_unique' }),
    }
    vi.mocked(db.update).mockReturnValueOnce(mockUpdate as never)

    await expect(
      tenantService.updateTenant(mockTenant.id, { slug: 'other-slug' })
    ).rejects.toMatchObject({
      code: 'TENANT_SLUG_CONFLICT',
      statusCode: 409,
    })
  })
})

describe('tenantService.updateTenantStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('tenant inactive yapılır', async () => {
    const updated = { ...mockTenant, status: 'inactive' as const }
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(mockTenant)
    const mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([updated]),
    }
    vi.mocked(db.update).mockReturnValueOnce(mockUpdate as never)

    const result = await tenantService.updateTenantStatus(mockTenant.id, 'inactive')
    expect(result.status).toBe('inactive')
  })

  it('mevcut olmayan id için NOT_FOUND fırlatır', async () => {
    // P-3 (CR-6): findFirst kaldırıldı — returning() boş dizisi NOT_FOUND tetikler
    const mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([]),
    }
    vi.mocked(db.update).mockReturnValueOnce(mockUpdate as never)

    await expect(
      tenantService.updateTenantStatus('nonexistent-id', 'inactive')
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })

  it('returning() boş dönerse NOT_FOUND fırlatır — P-4 eş zamanlı silme koruması', async () => {
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(mockTenant)
    const mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([]),
    }
    vi.mocked(db.update).mockReturnValueOnce(mockUpdate as never)

    await expect(
      tenantService.updateTenantStatus(mockTenant.id, 'inactive')
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })
})

describe('tenantService.getTenants', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sayfalı liste ve meta döner — P-2 transaction', async () => {
    const mockLimit = vi.fn().mockReturnThis()
    const mockOffset = vi.fn().mockReturnThis()
    const mockOrderBy = vi.fn().mockResolvedValueOnce([mockTenant])

    mockTransaction((tx) => {
      tx.select
        .mockReturnValueOnce({ from: vi.fn().mockResolvedValueOnce([{ count: 1 }]) })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            limit: mockLimit,
            offset: mockOffset,
            orderBy: mockOrderBy,
          }),
        })
    })

    const result = await tenantService.getTenants(1, 20)
    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 })
  })

  it('out-of-range page son sayfaya kısıtlanır — P-6 ghost state fix', async () => {
    const mockLimit = vi.fn().mockReturnThis()
    const mockOffset = vi.fn().mockReturnThis()
    const mockOrderBy = vi.fn().mockResolvedValueOnce([])

    // 25 kayıt, limit 20 → 2 sayfa var
    mockTransaction((tx) => {
      tx.select
        .mockReturnValueOnce({ from: vi.fn().mockResolvedValueOnce([{ count: 25 }]) })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            limit: mockLimit,
            offset: mockOffset,
            orderBy: mockOrderBy,
          }),
        })
    })

    // page=9999 isteniyor ama 2 sayfa var → page=2 döner
    const result = await tenantService.getTenants(9999, 20)
    expect(result.meta.page).toBe(2)
    expect(result.meta.total).toBe(25)
  })
})

describe('tenantService.getTenantById', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('mevcut tenant döner', async () => {
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(mockTenant)
    const result = await tenantService.getTenantById(mockTenant.id)
    expect(result).toEqual(mockTenant)
  })

  it('mevcut olmayan id için NOT_FOUND fırlatır', async () => {
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(null)

    await expect(
      tenantService.getTenantById('nonexistent-id')
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })
})
