import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => {
  return {
    db: {
      update: vi.fn(),
      transaction: vi.fn(),
    },
    users:    {},
    sessions: {},
    eq:     vi.fn((col, val) => ({ col, val })),
    and:    vi.fn((...args: unknown[]) => ({ and: args })),
    isNull: vi.fn((col) => ({ isNull: col })),
  }
})

import { db } from '@panel/db'
import { blockedUserService } from './blocked-user.service.js'

const mockDb = db as unknown as {
  update: ReturnType<typeof vi.fn>
  transaction: ReturnType<typeof vi.fn>
}

const TX_ID  = '11111111-1111-1111-1111-111111111111'
const SA_ID  = '22222222-2222-2222-2222-222222222222'
const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const mockFirmaUser = {
  id:       TX_ID,
  username: 'firmauser',
  role:     'firma' as const,
  tenantId: TENANT,
  status:   'active' as const,
}

function futureDate(ms = 60 * 60 * 1000) {
  return new Date(Date.now() + ms)
}

// tx.select().from().where().for('update').limit() zinciri
function makeTxSelectMock(result: unknown[]) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        for: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  })
}

// tx.update().set().where() zinciri — ilk users update, sonra sessions update
function makeTxUpdateMock() {
  return vi.fn()
    .mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: TX_ID }]),
      }),
    })
    .mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    })
}

function setupBlockUserTx(selectResult: unknown[]) {
  const txMock = {
    select: makeTxSelectMock(selectResult),
    update: makeTxUpdateMock(),
  }
  mockDb.transaction.mockImplementationOnce(async (fn: (tx: typeof txMock) => unknown) => fn(txMock))
  return txMock
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('blockedUserService.blockUser', () => {
  it('firma süreli engel koyabilir — başarılı', async () => {
    setupBlockUserTx([mockFirmaUser])

    const blockedUntil = futureDate()
    const result = await blockedUserService.blockUser(
      TX_ID,
      { blockedUntil },
      'firma',
      TENANT,
      '99999999-9999-9999-9999-999999999999',
    )

    expect(result.isPermanentlyBlocked).toBe(false)
    expect(result.blockedUntil).toBe(blockedUntil.toISOString())
  })

  it('firma kalıcı engel koyabilir — isPermanentlyBlocked: true döner', async () => {
    setupBlockUserTx([mockFirmaUser])

    const result = await blockedUserService.blockUser(
      TX_ID,
      { permanent: true },
      'firma',
      TENANT,
      '99999999-9999-9999-9999-999999999999',
    )

    expect(result.isPermanentlyBlocked).toBe(true)
    expect(result.blockedUntil).toBeNull()
  })

  it('başka tenant kullanıcısını engellemeye çalışınca 404 döner', async () => {
    setupBlockUserTx([])  // tenant scope ile hiç kullanıcı bulunamaz

    await expect(
      blockedUserService.blockUser(
        TX_ID,
        { permanent: true },
        'firma',
        'different-tenant-id',
        '99999999-9999-9999-9999-999999999999',
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('kullanıcı kendini engellemeye çalışınca 403 FORBIDDEN döner', async () => {
    setupBlockUserTx([mockFirmaUser])

    await expect(
      blockedUserService.blockUser(
        TX_ID,
        { permanent: true },
        'firma',
        TENANT,
        TX_ID,  // requesterId == targetUserId → self-block
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
  })

  it('super_admin rolündeki kullanıcıyı engellemeye çalışınca 403 FORBIDDEN döner', async () => {
    const superAdminUser = { ...mockFirmaUser, id: SA_ID, role: 'super_admin' as const }
    setupBlockUserTx([superAdminUser])

    await expect(
      blockedUserService.blockUser(
        SA_ID,
        { permanent: true },
        'super_admin',
        TENANT,
        '99999999-9999-9999-9999-999999999999',
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
  })

  it('geçmiş tarih ile engel koyunca 400 VALIDATION_ERROR döner', async () => {
    const pastDate = new Date(Date.now() - 1000)
    await expect(
      blockedUserService.blockUser(
        TX_ID,
        { blockedUntil: pastDate },
        'firma',
        TENANT,
        '99999999-9999-9999-9999-999999999999',
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })
  })

  it('transaction içinde blockedUntil süresi dolmuşsa VALIDATION_ERROR döner', async () => {
    vi.useFakeTimers()
    const currentTime = Date.now()
    const blockedUntil = new Date(currentTime + 100)  // 100ms ileride

    const txMock = {
      select: makeTxSelectMock([mockFirmaUser]),
      update: makeTxUpdateMock(),
    }
    // Transaction içinde zamanı ileri al — lock bekleme simülasyonu
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: typeof txMock) => unknown) => {
      vi.advanceTimersByTime(200)  // blockedUntil'i geç
      return fn(txMock)
    })

    await expect(
      blockedUserService.blockUser(TX_ID, { blockedUntil }, 'firma', TENANT, SA_ID)
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })

    vi.useRealTimers()
  })

  it('ne permanent ne blockedUntil verilmeden 400 VALIDATION_ERROR döner', async () => {
    await expect(
      blockedUserService.blockUser(
        TX_ID,
        {},
        'firma',
        TENANT,
        '99999999-9999-9999-9999-999999999999',
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })
  })
})

describe('blockedUserService.unblockUser', () => {
  it('firma engeli kaldırabilir — kullanıcı bilgisi döner', async () => {
    const updatedUser = { id: TX_ID, username: 'firmauser' }
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedUser]),
        }),
      }),
    })

    const result = await blockedUserService.unblockUser(TX_ID, 'firma', TENANT)
    expect(result.id).toBe(TX_ID)
    expect(result.username).toBe('firmauser')
  })

  it('başka tenant kullanıcısını unblock etmeye çalışınca 404 döner', async () => {
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    await expect(
      blockedUserService.unblockUser(TX_ID, 'firma', 'different-tenant-id')
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})
