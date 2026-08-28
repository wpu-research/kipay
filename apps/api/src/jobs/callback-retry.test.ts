import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      transactions: { findFirst: vi.fn() },
      callbackLogs:  { findMany:  vi.fn() },
    },
    update: vi.fn(),
    insert: vi.fn(),
  },
  transactions: {},
  callbackLogs: {},
  eq:  vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args: unknown[]) => args),
}))

global.fetch = vi.fn()

import { db }            from '@panel/db'
import { callbackRetry } from './callback-retry.js'

const mockFindFirst  = db.query.transactions.findFirst as ReturnType<typeof vi.fn>
const mockFindMany   = db.query.callbackLogs.findMany as ReturnType<typeof vi.fn>
const mockUpdate     = db.update as ReturnType<typeof vi.fn>
const mockInsert     = db.insert as ReturnType<typeof vi.fn>
const mockFetch      = global.fetch as ReturnType<typeof vi.fn>

function makeUpdateChain(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  }
}

function makeInsertChain() {
  return {
    values: vi.fn().mockResolvedValue([]),
  }
}

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id:             'tx-1',
    status:         'COMPLETED',
    type:           'deposit',
    amount:         '100.00',
    currency:       'TRY',
    externalUserId: 'user-1',
    merchant: {
      id:             'merchant-1',
      status:         'active',
      webhookUrl:     'https://example.com/webhook',
      callbackSecret: 'secret-abc',
    },
    ...overrides,
  }
}

describe('callbackRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('transaction bulunamadıysa erken return yapar, Error yok', async () => {
    mockFindFirst.mockResolvedValue(undefined)

    await expect(callbackRetry({ data: { transactionId: 'tx-missing' } })).resolves.not.toThrow()

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('APPROVED tx → COMPLETED geçişini yapar, callback gönderir', async () => {
    const approvedTx = makeTx({ status: 'APPROVED' })
    const completedTx = makeTx({ status: 'COMPLETED' })

    // İlk findFirst (APPROVED tx), ikinci findFirst (COMPLETED tx sonrası)
    mockFindFirst
      .mockResolvedValueOnce(approvedTx)
      .mockResolvedValueOnce(completedTx)

    mockFindMany.mockResolvedValue([])
    mockUpdate.mockReturnValue(makeUpdateChain([{ id: 'tx-1' }]))
    mockInsert.mockReturnValue(makeInsertChain())
    mockFetch.mockResolvedValue({
      status: 200,
      ok:     true,
      text:   vi.fn().mockResolvedValue('ok'),
    })

    await callbackRetry({ data: { transactionId: 'tx-1' } })

    // update çağrıları: APPROVED→COMPLETED + callbackStatus='sent'
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Her iki update aynı set mock'u paylaşır (mockReturnValue aynı chain döner)
    const setMock = mockUpdate.mock.results[0]!.value.set
    // İlk update: APPROVED → COMPLETED geçişi
    expect(setMock.mock.calls[0]![0].status).toBe('COMPLETED')
    // İkinci update: callbackStatus='sent'
    expect(setMock.mock.calls[1]![0].callbackStatus).toBe('sent')
  })

  it('başarılı callback → callbackStatus="sent" set edilir', async () => {
    const tx = makeTx()
    mockFindFirst.mockResolvedValue(tx)
    mockFindMany.mockResolvedValue([])
    mockUpdate.mockReturnValue(makeUpdateChain([]))
    mockInsert.mockReturnValue(makeInsertChain())
    mockFetch.mockResolvedValue({
      status: 200,
      ok:     true,
      text:   vi.fn().mockResolvedValue('ok'),
    })

    await callbackRetry({ data: { transactionId: 'tx-1' } })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledTimes(1)

    // callbackStatus='sent' set çağrısını doğrula
    const setCall = mockUpdate.mock.results[0]!.value.set.mock.calls[0][0]
    expect(setCall.callbackStatus).toBe('sent')
  })

  it('non-2xx yanıt → callback_logs yazılır, Error fırlatır (retry tetiklenir)', async () => {
    const tx = makeTx()
    mockFindFirst.mockResolvedValue(tx)
    mockFindMany.mockResolvedValue([])
    mockUpdate.mockReturnValue(makeUpdateChain([]))
    mockInsert.mockReturnValue(makeInsertChain())
    mockFetch.mockResolvedValue({
      status: 500,
      ok:     false,
      text:   vi.fn().mockResolvedValue('Internal Server Error'),
    })

    await expect(callbackRetry({ data: { transactionId: 'tx-1' } })).rejects.toThrow('Callback başarısız')

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('fetch timeout → callback_logs yazılır, Error fırlatır', async () => {
    const tx = makeTx()
    mockFindFirst.mockResolvedValue(tx)
    mockFindMany.mockResolvedValue([])
    mockUpdate.mockReturnValue(makeUpdateChain([]))
    mockInsert.mockReturnValue(makeInsertChain())

    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    mockFetch.mockRejectedValue(abortError)

    await expect(callbackRetry({ data: { transactionId: 'tx-1' } })).rejects.toThrow('Callback başarısız')

    expect(mockInsert).toHaveBeenCalledTimes(1)
    // Log kaydında errorMessage = 'HTTP timeout (10s)' olmalı
    const insertValues = mockInsert.mock.results[0]!.value.values.mock.calls[0][0]
    expect(insertValues.errorMessage).toBe('HTTP timeout (10s)')
    expect(insertValues.success).toBe(false)
  })

  it('webhookUrl eksik → erken return, callback yok', async () => {
    const tx = makeTx({ merchant: { id: 'merchant-1', webhookUrl: null, callbackSecret: 'secret' } })
    mockFindFirst.mockResolvedValue(tx)

    await expect(callbackRetry({ data: { transactionId: 'tx-1' } })).resolves.not.toThrow()

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('callbackSecret eksik → erken return, callback yok', async () => {
    const tx = makeTx({ merchant: { id: 'merchant-1', webhookUrl: 'https://example.com/wh', callbackSecret: null } })
    mockFindFirst.mockResolvedValue(tx)

    await expect(callbackRetry({ data: { transactionId: 'tx-1' } })).resolves.not.toThrow()

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('5. denemede tükenme → callbackStatus="failed" set edilir, Error yok', async () => {
    const tx = makeTx()
    mockFindFirst.mockResolvedValue(tx)
    // 4 önceki deneme kayıtlı → bu 5. deneme
    mockFindMany.mockResolvedValue([{}, {}, {}, {}])
    mockUpdate.mockReturnValue(makeUpdateChain([]))
    mockInsert.mockReturnValue(makeInsertChain())
    mockFetch.mockResolvedValue({
      status: 503,
      ok:     false,
      text:   vi.fn().mockResolvedValue('Service Unavailable'),
    })

    await expect(callbackRetry({ data: { transactionId: 'tx-1' } })).resolves.not.toThrow()

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledTimes(1)

    const setCall = mockUpdate.mock.results[0]!.value.set.mock.calls[0][0]
    expect(setCall.callbackStatus).toBe('failed')
  })

  it('uygun olmayan status için callback göndermez', async () => {
    // 1. findFirst: PENDING (not APPROVED so no COMPLETED transition)
    // 2. findFirst again: PENDING (not in callback statuses)
    const tx = makeTx({ status: 'PENDING' })
    mockFindFirst.mockResolvedValue(tx)

    await expect(callbackRetry({ data: { transactionId: 'tx-1' } })).resolves.not.toThrow()

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('X-Signature header HMAC-SHA256 formatında gönderilir', async () => {
    const tx = makeTx()
    mockFindFirst.mockResolvedValue(tx)
    mockFindMany.mockResolvedValue([])
    mockUpdate.mockReturnValue(makeUpdateChain([]))
    mockInsert.mockReturnValue(makeInsertChain())
    mockFetch.mockResolvedValue({
      status: 200,
      ok:     true,
      text:   vi.fn().mockResolvedValue('ok'),
    })

    await callbackRetry({ data: { transactionId: 'tx-1' } })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchArgs = mockFetch.mock.calls[0]
    const headers = fetchArgs[1].headers
    expect(headers['X-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(headers['Content-Type']).toBe('application/json')
  })
})
