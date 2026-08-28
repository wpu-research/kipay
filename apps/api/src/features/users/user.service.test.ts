import { describe, it, expect, vi, beforeEach } from 'vitest'

// @panel/db mock
vi.mock('@panel/db', () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
  },
  users:    {},
  sessions: {},
  tenants:  {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args) => ({ and: args })),
  isNull: vi.fn((col) => ({ isNull: col })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

// auth.service mock — encryptTotpSecret
vi.mock('../auth/auth.service.js', () => ({
  authService: {
    encryptTotpSecret: vi.fn((secret: string) => `encrypted:${secret}`),
  },
}))

// argon2 mock
vi.mock('argon2', () => ({
  hash: vi.fn(async () => 'hashed_password'),
}))

// otplib mock
vi.mock('otplib', () => ({
  authenticator: {
    generateSecret: vi.fn(() => 'MOCKSECRET32CHARS'),
    keyuri:         vi.fn(() => 'otpauth://totp/Panel:testuser?secret=MOCKSECRET32CHARS&issuer=Panel'),
  },
}))

import { db } from '@panel/db'
import { userService } from './user.service.js'

const mockUser = {
  id:           '00000000-0000-0000-0000-000000000001',
  username:     'testuser',
  passwordHash: 'hashed_password',
  role:         'operator' as const,
  tenantId:     '00000000-0000-0000-0000-000000000010',
  totpSecret:   'encrypted:MOCKSECRET32CHARS',
  status:       'active' as const,
  createdAt:    new Date('2026-01-01'),
  updatedAt:    new Date('2026-01-01'),
}

// getUsers transaction mock yardımcısı
function mockTransaction(txSetup: (tx: { select: ReturnType<typeof vi.fn> }) => void) {
  vi.mocked(db.transaction).mockImplementationOnce(async (fn) => {
    const tx = { select: vi.fn() }
    txSetup(tx)
    return fn(tx as never)
  })
}

// updateUserStatus (inactive) transaction mock yardımcısı — super_admin / firma akışı
function mockUpdateTransaction(
  firstUpdateReturning: unknown[],
  sessionUpdateResult: unknown[] = [],
) {
  vi.mocked(db.transaction).mockImplementationOnce(async (fn) => {
    const txUpdate = vi.fn()
      .mockReturnValueOnce({
        set:       vi.fn().mockReturnThis(),
        where:     vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce(firstUpdateReturning),
      })
      .mockReturnValueOnce({
        set:   vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValueOnce(sessionUpdateResult),
      })
    return fn({ update: txUpdate } as never)
  })
}

// merchant updateUserStatus transaction mock yardımcısı
// userUpdateReturning: UPDATE users returning (operator koşuluyla)
// existsResult: UPDATE nothing durumunda SELECT exists result
function mockMerchantUpdateTransaction(
  userUpdateReturning: unknown[],
  existsResult: unknown[] = [],
  sessionUpdateResult: unknown[] = [],
) {
  vi.mocked(db.transaction).mockImplementationOnce(async (fn) => {
    const txUpdate = vi.fn()
      .mockReturnValueOnce({
        set:       vi.fn().mockReturnThis(),
        where:     vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValueOnce(userUpdateReturning),
      })
      .mockReturnValueOnce({
        set:   vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValueOnce(sessionUpdateResult),
      })
    const txSelect = vi.fn().mockReturnValueOnce({
      from:  vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce(existsResult),
    })
    return fn({ update: txUpdate, select: txSelect } as never)
  })
}

// ─── createUser ─────────────────────────────────────────────────────────────

describe('userService.createUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('firma kullanıcısı yeni finans kullanıcısı oluşturabilir', async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([{ ...mockUser, role: 'finans' }]),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    const result = await userService.createUser(
      { username: 'testuser', password: 'password123', role: 'finans' },
      'firma',
      mockUser.tenantId,
    )
    expect(result.user.role).toBe('finans')
    expect(result.totpSecret).toBe('MOCKSECRET32CHARS')
    expect(result.totpUri).toContain('otpauth://')
  })

  it('firma kullanıcısı yeni merchant kullanıcısı oluşturabilir', async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([{ ...mockUser, role: 'merchant' }]),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    const result = await userService.createUser(
      { username: 'testuser', password: 'password123', role: 'merchant' },
      'firma',
      mockUser.tenantId,
    )
    expect(result.user.role).toBe('merchant')
  })

  it('merchant kullanıcısı operator oluşturabilir', async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([{ ...mockUser, role: 'operator' }]),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    const result = await userService.createUser(
      { username: 'testuser', password: 'password123', role: 'operator' },
      'merchant',
      mockUser.tenantId,
    )
    expect(result.user.role).toBe('operator')
  })

  it('merchant kullanıcısı firma rolü atamaya çalışırsa 403 FORBIDDEN alır', async () => {
    await expect(
      userService.createUser(
        { username: 'testuser', password: 'password123', role: 'firma' },
        'merchant',
        mockUser.tenantId,
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
  })

  it('super_admin rolü atamaya çalışırsa 403 FORBIDDEN döner', async () => {
    await expect(
      userService.createUser(
        { username: 'testuser', password: 'password123', role: 'super_admin' as never },
        'super_admin',
        mockUser.tenantId,
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
  })

  it('tekrar eden username 409 USER_EXISTS döner', async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValueOnce({ code: '23505', constraint: 'users_username_unique' }),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    await expect(
      userService.createUser(
        { username: 'testuser', password: 'password123', role: 'operator' },
        'firma',
        mockUser.tenantId,
      )
    ).rejects.toMatchObject({ code: 'USER_EXISTS', statusCode: 409 })
  })

  it('finans rolündeki kullanıcı (requester) bu endpoint\'e erişemez — ileride route seviyesinde kontrol edilir (servis seviyesinde blok yok)', async () => {
    // Servis katmanı finans requester'ı için yasak uygulamaz (route layer yapar)
    // Yalnızca rol kısıtlamasını test ediyoruz: finans kendi rolünü atayabilir mi?
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([{ ...mockUser, role: 'operator' }]),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    // finans requester 'operator' role atamaya çalışıyor — servis engellemez, route engeller
    const result = await userService.createUser(
      { username: 'testuser', password: 'password123', role: 'operator' },
      'finans',
      mockUser.tenantId,
    )
    expect(result.user.role).toBe('operator')
  })

  it('oluşturulan kullanıcıda totpUri ve totpSecret döner', async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([mockUser]),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    const result = await userService.createUser(
      { username: 'testuser', password: 'password123', role: 'operator' },
      'firma',
      mockUser.tenantId,
    )
    expect(result.totpSecret).toBeDefined()
    expect(result.totpUri).toBeDefined()
    expect(result.totpUri).toContain('otpauth://')
  })

  it('geçersiz tenantId (FK ihlali) 404 NOT_FOUND döner — race condition güvenlik ağı', async () => {
    // Tenant check geçti (aktif görünüyor), ancak insert anında FK ihlali (race condition)
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([{ status: 'active' }]),
    }
    vi.mocked(db.select).mockReturnValueOnce(mockSelect as never)

    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValueOnce({ code: '23503' }),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    await expect(
      userService.createUser(
        { username: 'testuser', password: 'password123', role: 'operator', tenantId: '00000000-0000-0000-0000-999999999999' },
        'super_admin',
        mockUser.tenantId,
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('super_admin pasif tenant için kullanıcı oluşturmaya çalışırsa 422 TENANT_INACTIVE döner', async () => {
    // Tenant select mock: inactive tenant döner
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([{ status: 'inactive' }]),
    }
    vi.mocked(db.select).mockReturnValueOnce(mockSelect as never)

    await expect(
      userService.createUser(
        { username: 'testuser', password: 'password123', role: 'operator', tenantId: '00000000-0000-0000-0000-000000000099' },
        'super_admin',
        mockUser.tenantId, // farklı tenantId → cross-tenant akış
      )
    ).rejects.toMatchObject({ code: 'TENANT_INACTIVE', statusCode: 422 })
  })

  it('super_admin var olmayan tenant için kullanıcı oluşturmaya çalışırsa 404 NOT_FOUND döner (tenant check)', async () => {
    // Tenant select mock: tenant yok
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([]),
    }
    vi.mocked(db.select).mockReturnValueOnce(mockSelect as never)

    await expect(
      userService.createUser(
        { username: 'testuser', password: 'password123', role: 'operator', tenantId: '00000000-0000-0000-0000-000000000099' },
        'super_admin',
        mockUser.tenantId,
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('başka unique constraint ihlali USER_EXISTS olarak dönemez', async () => {
    const mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockRejectedValueOnce({ code: '23505', constraint: 'users_other_unique' }),
    }
    vi.mocked(db.insert).mockReturnValueOnce(mockInsert as never)

    await expect(
      userService.createUser(
        { username: 'testuser', password: 'password123', role: 'operator' },
        'firma',
        mockUser.tenantId,
      )
    ).rejects.not.toMatchObject({ code: 'USER_EXISTS' })
  })
})

// ─── updateUserStatus ────────────────────────────────────────────────────────

describe('userService.updateUserStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('kullanıcı pasif yapılır — status: inactive döner', async () => {
    const inactiveUser = { ...mockUser, status: 'inactive' as const }
    mockUpdateTransaction([inactiveUser])

    const result = await userService.updateUserStatus(
      mockUser.id,
      'inactive',
      'firma',
      mockUser.tenantId,
    )
    expect(result.status).toBe('inactive')
  })

  it('pasif yapılan kullanıcının aktif oturumları geçersiz kılınır — atomik transaction', async () => {
    const inactiveUser = { ...mockUser, status: 'inactive' as const }
    mockUpdateTransaction([inactiveUser])

    await userService.updateUserStatus(
      mockUser.id,
      'inactive',
      'firma',
      mockUser.tenantId,
    )

    // inactive path transaction içinde çalışmalı (atomik)
    expect(vi.mocked(db.transaction)).toHaveBeenCalledTimes(1)
  })

  it('farklı tenant kullanıcısı güncellemeye çalışınca 404 döner', async () => {
    mockUpdateTransaction([]) // boş dönüş → farklı tenant veya yok

    await expect(
      userService.updateUserStatus(
        mockUser.id,
        'inactive',
        'firma',
        'different-tenant-id',
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('var olmayan kullanıcı id\'si 404 döner', async () => {
    mockUpdateTransaction([]) // boş dönüş → kullanıcı yok

    await expect(
      userService.updateUserStatus(
        'nonexistent-id',
        'inactive',
        'firma',
        mockUser.tenantId,
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('aktif yapılırken sessions güncellenmez', async () => {
    const activeUser = { ...mockUser, status: 'active' as const }
    const mockUpdate = {
      set:       vi.fn().mockReturnThis(),
      where:     vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValueOnce([activeUser]),
    }
    vi.mocked(db.update).mockReturnValueOnce(mockUpdate as never)

    await userService.updateUserStatus(
      mockUser.id,
      'active',
      'firma',
      mockUser.tenantId,
    )

    // Yalnızca users güncellendi, sessions güncellenmedi
    expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1)
  })

  // DK-3: merchant yalnızca operator rolündeki kullanıcıları pasif yapabilir

  it('DK-3: merchant operator rolündeki kullanıcıyı pasif yapabilir', async () => {
    const operatorUser = { ...mockUser, role: 'operator' as const, status: 'inactive' as const }
    // UPDATE users WHERE role='operator' → satır döner; UPDATE sessions → başarı
    mockMerchantUpdateTransaction([operatorUser])

    const result = await userService.updateUserStatus(
      mockUser.id,
      'inactive',
      'merchant',
      mockUser.tenantId,
    )
    expect(result.status).toBe('inactive')
  })

  it('DK-3: merchant firma rolündeki kullanıcıyı pasif yapmaya çalışınca 403 FORBIDDEN alır', async () => {
    // UPDATE users WHERE role='operator' → boş (kullanıcı firma); SELECT exists → firma rolü bulundu
    mockMerchantUpdateTransaction([], [{ role: 'firma' }])

    await expect(
      userService.updateUserStatus(
        mockUser.id,
        'inactive',
        'merchant',
        mockUser.tenantId,
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
  })

  it('DK-3: merchant merchant rolündeki kullanıcıyı pasif yapmaya çalışınca 403 FORBIDDEN alır', async () => {
    // UPDATE users WHERE role='operator' → boş; SELECT exists → merchant rolü bulundu
    mockMerchantUpdateTransaction([], [{ role: 'merchant' }])

    await expect(
      userService.updateUserStatus(
        mockUser.id,
        'inactive',
        'merchant',
        mockUser.tenantId,
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
  })

  it('DK-3: merchant başka tenant kullanıcısını güncellemek isteyince 404 döner', async () => {
    // UPDATE users WHERE role='operator' → boş; SELECT exists → boş (farklı tenant)
    mockMerchantUpdateTransaction([], [])

    await expect(
      userService.updateUserStatus(
        mockUser.id,
        'inactive',
        'merchant',
        'different-tenant-id',
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

// ─── getUsers ────────────────────────────────────────────────────────────────

describe('userService.getUsers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('firma kendi tenant kullanıcılarını listeler — sayfalı liste ve meta döner', async () => {
    mockTransaction((tx) => {
      tx.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValueOnce([{ count: 1 }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValueOnce([mockUser]),
                }),
              }),
            }),
          }),
        })
    })

    const result = await userService.getUsers(mockUser.tenantId, 1, 20)
    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 })
    expect(result.data).toHaveLength(1)
  })

  it('başka tenant kullanıcıları listede görünmez — tenant scope korunur', async () => {
    mockTransaction((tx) => {
      tx.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValueOnce([{ count: 0 }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValueOnce([]),
                }),
              }),
            }),
          }),
        })
    })

    const result = await userService.getUsers('other-tenant-id', 1, 20)
    expect(result.data).toHaveLength(0)
    expect(result.meta.total).toBe(0)
  })

  it('out-of-range page son sayfaya kısıtlanır — ghost state önleme', async () => {
    mockTransaction((tx) => {
      tx.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValueOnce([{ count: 25 }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValueOnce([]),
                }),
              }),
            }),
          }),
        })
    })

    // 25 kayıt, limit 20 → 2 sayfa; page=9999 → page=2 döner
    const result = await userService.getUsers(mockUser.tenantId, 9999, 20)
    expect(result.meta.page).toBe(2)
    expect(result.meta.total).toBe(25)
  })
})
