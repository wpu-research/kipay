import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      users:         { findMany: vi.fn() },
      notifications: { findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    $count: vi.fn(),
  },
  notifications: {},
  users: {},
  eq:  vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
}))

import { db } from '@panel/db'
import { notificationService } from './notification.service.js'

const mockUsersQuery  = (db.query as any).users         as { findMany: ReturnType<typeof vi.fn> }
const mockNotifQuery  = (db.query as any).notifications as { findMany: ReturnType<typeof vi.fn> }
const mockInsert      = db.insert as ReturnType<typeof vi.fn>
const mockUpdate      = db.update as ReturnType<typeof vi.fn>
const mockCount       = db.$count as ReturnType<typeof vi.fn>

const basePayload = {
  txId:         'tx-1',
  amount:       '100.00',
  currency:     'TRY',
  merchantName: 'Test Merchant',
  createdAt:    '2026-03-22T00:00:00Z',
}

beforeEach(() => { vi.clearAllMocks() })

describe('notificationService.createPendingNotifications', () => {
  it('finans kullanıcıları için bildirim oluşturur', async () => {
    mockUsersQuery.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }])
    const mockInsertReturn = { values: vi.fn().mockResolvedValue(undefined) }
    mockInsert.mockReturnValue(mockInsertReturn)

    await notificationService.createPendingNotifications({
      tenantId:      't1',
      transactionId: 'tx-1',
      payload:       basePayload,
    })

    expect(mockInsert).toHaveBeenCalledOnce()
    const insertArg = mockInsertReturn.values.mock.calls[0][0]
    expect(insertArg).toHaveLength(2)
    expect(insertArg[0].userId).toBe('u1')
    expect(insertArg[1].userId).toBe('u2')
    expect(insertArg[0].type).toBe('transaction.pending')
  })

  it('finans kullanıcısı yoksa insert çağrılmaz', async () => {
    mockUsersQuery.findMany.mockResolvedValue([])

    await notificationService.createPendingNotifications({
      tenantId:      't1',
      transactionId: 'tx-1',
      payload:       basePayload,
    })

    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('notificationService.listNotifications', () => {
  it('sayfalı bildirim listesi döner', async () => {
    const notifs = [{ id: 'n1', isRead: false }, { id: 'n2', isRead: true }]
    mockNotifQuery.findMany.mockResolvedValue(notifs)
    mockCount.mockResolvedValue(2)

    const result = await notificationService.listNotifications({
      tenantId: 't1', userId: 'u1', page: 1, limit: 20,
    })

    expect(result.data).toHaveLength(2)
    expect(result.meta).toEqual({ total: 2, page: 1, limit: 20 })
  })

  it('isRead filtresi ile çalışır', async () => {
    mockNotifQuery.findMany.mockResolvedValue([{ id: 'n1', isRead: false }])
    mockCount.mockResolvedValue(1)

    const result = await notificationService.listNotifications({
      tenantId: 't1', userId: 'u1', isRead: false, page: 1, limit: 20,
    })

    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
  })
})

describe('notificationService.markRead', () => {
  it('bildirimi okundu işaretler', async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: 'n1' }])
    const mockWhere     = vi.fn().mockReturnValue({ returning: mockReturning })
    const mockSet       = vi.fn().mockReturnValue({ where: mockWhere })
    mockUpdate.mockReturnValue({ set: mockSet })

    const result = await notificationService.markRead({
      tenantId: 't1', userId: 'u1', id: 'n1',
    })
    expect(result).toEqual({ success: true })
  })

  it('yanlış tenantId/userId → 404', async () => {
    const mockReturning = vi.fn().mockResolvedValue([])
    const mockWhere     = vi.fn().mockReturnValue({ returning: mockReturning })
    const mockSet       = vi.fn().mockReturnValue({ where: mockWhere })
    mockUpdate.mockReturnValue({ set: mockSet })

    await expect(notificationService.markRead({
      tenantId: 't-wrong', userId: 'u-wrong', id: 'n1',
    })).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

describe('notificationService.markAllRead', () => {
  it('etkilenen satır sayısı döner', async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: 'n1' }, { id: 'n2' }])
    const mockWhere     = vi.fn().mockReturnValue({ returning: mockReturning })
    const mockSet       = vi.fn().mockReturnValue({ where: mockWhere })
    mockUpdate.mockReturnValue({ set: mockSet })

    const result = await notificationService.markAllRead({ tenantId: 't1', userId: 'u1' })
    expect(result).toEqual({ updated: 2 })
  })
})
