import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      transactions: { findFirst: vi.fn() },
    },
    update: vi.fn(),
  },
  transactions: { id: 'id', callbackStatus: 'callbackStatus' },
  callbackLogs: {},
  merchants:    {},
  eq:      vi.fn((col, val) => ({ col, val })),
  and:     vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((col, vals) => ({ col, vals })),
  sql:     vi.fn(),
  gte:     vi.fn(),
  lte:     vi.fn(),
  desc:    vi.fn(),
  count:   vi.fn(),
}))

import { db }              from '@panel/db'
import { callbackService } from './callback.service.js'

const mockFindFirst = db.query.transactions.findFirst as ReturnType<typeof vi.fn>
const mockUpdate    = db.update as ReturnType<typeof vi.fn>

function makeUpdateChain(rows: unknown[]) {
  const set = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  })
  return { set }
}

function makeBoss() {
  return { send: vi.fn().mockResolvedValue('job-1') } as any
}

describe('callbackService.retryCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('failed callback → callbackStatus pending yapılır, sonra job kuyruğa alınır', async () => {
    mockFindFirst.mockResolvedValue({ id: 'tx-1', tenantId: 't-1', callbackStatus: 'failed' })
    const chain = makeUpdateChain([{ id: 'tx-1' }])
    mockUpdate.mockReturnValue(chain)
    const boss = makeBoss()

    const result = await callbackService.retryCallback(boss, 't-1', 'tx-1')

    expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ callbackStatus: 'pending' }))
    expect(boss.send).toHaveBeenCalledWith('callback-retry', { transactionId: 'tx-1' }, expect.any(Object))
    expect(mockUpdate.mock.invocationCallOrder[0]).toBeLessThan(boss.send.mock.invocationCallOrder[0])
    expect(result).toEqual({ jobId: 'job-1' })
  })

  it('dead callback de retry edilebilir', async () => {
    mockFindFirst.mockResolvedValue({ id: 'tx-1', tenantId: 't-1', callbackStatus: 'dead' })
    mockUpdate.mockReturnValue(makeUpdateChain([{ id: 'tx-1' }]))
    const boss = makeBoss()

    await callbackService.retryCallback(boss, 't-1', 'tx-1')

    expect(boss.send).toHaveBeenCalledTimes(1)
  })

  it('sent callback → 409, update ve job yok', async () => {
    mockFindFirst.mockResolvedValue({ id: 'tx-1', tenantId: 't-1', callbackStatus: 'sent' })
    const boss = makeBoss()

    await expect(callbackService.retryCallback(boss, 't-1', 'tx-1')).rejects.toMatchObject({ statusCode: 409 })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('eşzamanlı retry: koşullu update satır döndürmezse 409, job yok', async () => {
    mockFindFirst.mockResolvedValue({ id: 'tx-1', tenantId: 't-1', callbackStatus: 'failed' })
    mockUpdate.mockReturnValue(makeUpdateChain([]))
    const boss = makeBoss()

    await expect(callbackService.retryCallback(boss, 't-1', 'tx-1')).rejects.toMatchObject({ statusCode: 409 })
    expect(boss.send).not.toHaveBeenCalled()
  })

  it('başka tenant\'ın işlemi → 404', async () => {
    mockFindFirst.mockResolvedValue({ id: 'tx-1', tenantId: 'other', callbackStatus: 'failed' })
    const boss = makeBoss()

    await expect(callbackService.retryCallback(boss, 't-1', 'tx-1')).rejects.toMatchObject({ statusCode: 404 })
    expect(boss.send).not.toHaveBeenCalled()
  })
})
