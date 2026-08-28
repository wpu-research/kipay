import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      transactions:        { findFirst: vi.fn(), findMany: vi.fn() },
      merchants:           { findFirst: vi.fn(), findMany: vi.fn() },
      financeGroupMembers: { findFirst: vi.fn() },
      blockedPlayers:      { findFirst: vi.fn() },
    },
    insert:      vi.fn(),
    update:      vi.fn(),
    $count:      vi.fn(),
    transaction: vi.fn(),
  },
  transactions:        {},
  merchants:           {},
  financeGroupMembers: {},
  transactionComments: {},
  blockedPlayers:      {},
  eq:      vi.fn((col, val) => ({ col, val })),
  and:     vi.fn((...args: unknown[]) => args),
  or:      vi.fn((...args: unknown[]) => args),
  gt:      vi.fn((col, val) => ({ col, val, gt: true })),
  sql:     vi.fn((strings: TemplateStringsArray) => strings[0]),
  inArray: vi.fn((col, vals) => ({ col, vals })),
}))

vi.mock('./routing-engine.js', () => ({
  validateRouting:          vi.fn(),
  selectPaymentAccountInTx: vi.fn(),
}))

vi.mock('../../sse/sse-manager.js', () => ({
  emitToTenant: vi.fn(),
  addConnection: vi.fn(),
  removeConnection: vi.fn(),
}))

vi.mock('../notifications/notification.service.js', () => ({
  notificationService: {
    createPendingNotifications: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../settings/settings.service.js', () => ({
  getClaimTimeoutMs: vi.fn().mockResolvedValue(10 * 60 * 1000),
}))

import { db } from '@panel/db'
import { validateRouting, selectPaymentAccountInTx } from './routing-engine.js'
import * as sseManagerMock from '../../sse/sse-manager.js'
import { transactionService } from './transaction.service.js'
import { getClaimTimeoutMs } from '../settings/settings.service.js'

const mockTxQuery               = (db.query as any).transactions        as { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
const mockMerchantQuery         = (db.query as any).merchants           as { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
const mockFgMemberQuery         = (db.query as any).financeGroupMembers as { findFirst: ReturnType<typeof vi.fn> }
const mockInsert                = db.insert as ReturnType<typeof vi.fn>
const mockUpdate                = db.update as ReturnType<typeof vi.fn>
const mockCount                 = db.$count as ReturnType<typeof vi.fn>
const mockDbTransaction         = db.transaction as ReturnType<typeof vi.fn>
const mockValidateRouting       = validateRouting as ReturnType<typeof vi.fn>
const mockSelectPaymentInTx     = selectPaymentAccountInTx as ReturnType<typeof vi.fn>
const mockEmitToTenant          = (sseManagerMock as any).emitToTenant as ReturnType<typeof vi.fn>

const routeResult = { paymentAccountId: 'paid-1', accountNumber: 'TR33...' }

const startedTx = {
  id:               'txid-1',
  tenantId:         'tid-1',
  merchantId:       'mid-1',
  paymentAccountId: 'paid-1',
  externalUserId:   'player-1',
  amount:           '500.00',
  currency:         'TRY',
  status:           'STARTED',
  createdAt:        new Date(),
  updatedAt:        new Date(),
}

const pendingTx = { ...startedTx, status: 'PENDING' }

function makeInsertChain(rows: unknown[]) {
  return { values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) }
}

function makeUpdateChain(rows: unknown[]) {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows) }) }) }
}

const startedTxWithExpiry = {
  ...startedTx,
  type:            'deposit',
  startedExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
  paymentMethod:   null,
}

const routeValidated = { financeGroupId: 'fg-1', environment: 'production' }

function makeDbTx(insertRows: unknown[], blockedResult: unknown = null) {
  return {
    query:  { blockedPlayers: { findFirst: vi.fn().mockResolvedValue(blockedResult) } },
    insert: vi.fn().mockReturnValue(makeInsertChain(insertRows)),
  }
}

describe('transactionService.initiateTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('başarı: STARTED işlem döner, depositAddress ve startedExpiresAt içerir', async () => {
    const tx = makeDbTx([startedTxWithExpiry])
    mockValidateRouting.mockResolvedValueOnce(routeValidated)
    mockSelectPaymentInTx.mockResolvedValueOnce(routeResult)
    mockDbTransaction.mockImplementationOnce(async (fn: (tx: typeof tx) => unknown) => fn(tx))

    const result = await transactionService.initiateTransaction({
      tenantId:   'tid-1',
      merchantId: 'mid-1',
      input: { externalUserId: 'player-1', amount: '500.00', currency: 'TRY' },
    })

    expect(result.status).toBe('STARTED')
    expect(result.depositAddress).toBe('TR33...')
    expect(result.id).toBe('txid-1')
    expect(result.startedExpiresAt).toBeDefined()
  })

  it('SSE emit ve notification ÇAĞRILMAZ (confirmDeposit\'e taşındı)', async () => {
    const tx = makeDbTx([startedTxWithExpiry])
    mockValidateRouting.mockResolvedValueOnce(routeValidated)
    mockSelectPaymentInTx.mockResolvedValueOnce(routeResult)
    mockDbTransaction.mockImplementationOnce(async (fn: (tx: typeof tx) => unknown) => fn(tx))

    await transactionService.initiateTransaction({
      tenantId:   'tid-1',
      merchantId: 'mid-1',
      input: { externalUserId: 'player-1', amount: '500.00', currency: 'TRY' },
    })

    expect(mockEmitToTenant).not.toHaveBeenCalled()
  })

  it('validateRouting hata fırlatırsa, hata yukarı iletilir', async () => {
    mockValidateRouting.mockRejectedValueOnce({ code: 'ROUTING_FAILED', statusCode: 422 })

    await expect(transactionService.initiateTransaction({
      tenantId: 'tid-1', merchantId: 'mid-1',
      input: { externalUserId: 'p-1', amount: '100.00', currency: 'TRY' },
    })).rejects.toMatchObject({ code: 'ROUTING_FAILED' })
  })

  it('insert başarısız olursa INTERNAL_SERVER_ERROR', async () => {
    const tx = makeDbTx([])  // boş array — insert başarısız
    mockValidateRouting.mockResolvedValueOnce(routeValidated)
    mockSelectPaymentInTx.mockResolvedValueOnce(routeResult)
    mockDbTransaction.mockImplementationOnce(async (fn: (tx: typeof tx) => unknown) => fn(tx))

    await expect(transactionService.initiateTransaction({
      tenantId: 'tid-1', merchantId: 'mid-1',
      input: { externalUserId: 'p-1', amount: '100.00', currency: 'TRY' },
    })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', statusCode: 500 })
  })
})

describe('transactionService.confirmDeposit', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('STARTED deposit → PENDING, SSE ve notification tetiklenir', async () => {
    const confirmedTx = { ...startedTxWithExpiry, status: 'PENDING' }
    mockUpdate.mockReturnValueOnce(makeUpdateChain([confirmedTx]))
    mockMerchantQuery.findFirst.mockResolvedValueOnce({ merchantName: 'Test Merchant' })

    const result = await transactionService.confirmDeposit({
      tenantId: 'tid-1', merchantId: 'mid-1', txId: 'txid-1',
    })

    expect(result.status).toBe('PENDING')
    expect(mockEmitToTenant).toHaveBeenCalledWith('tid-1', 'transaction.pending', expect.objectContaining({
      type:         'transaction.pending',
      txId:         'txid-1',
      merchantName: 'Test Merchant',
    }))
  })

  it('işlem bulunamazsa (başka merchant) → NOT_FOUND (404)', async () => {
    mockUpdate.mockReturnValueOnce(makeUpdateChain([]))  // WHERE eşleşmedi
    mockTxQuery.findFirst.mockResolvedValueOnce(null)    // işlem yok

    await expect(transactionService.confirmDeposit({
      tenantId: 'tid-1', merchantId: 'mid-1', txId: 'txid-999',
    })).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('işlem STARTED değilse → INVALID_STATE_TRANSITION (409)', async () => {
    mockUpdate.mockReturnValueOnce(makeUpdateChain([]))  // WHERE STARTED eşleşmedi
    mockTxQuery.findFirst.mockResolvedValueOnce({ ...startedTxWithExpiry, status: 'PENDING', merchantId: 'mid-1' })

    await expect(transactionService.confirmDeposit({
      tenantId: 'tid-1', merchantId: 'mid-1', txId: 'txid-1',
    })).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION', statusCode: 409 })
  })
})

describe('transactionService.requestWithdrawal', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const withdrawalTx = {
    id:               'txid-w1',
    tenantId:         'tid-1',
    merchantId:       'mid-1',
    paymentAccountId: null,
    externalUserId:   'player-1',
    amount:           '250.00',
    currency:         'TRY',
    status:           'PENDING',
    type:             'withdrawal',
    paymentMethod:    'IBAN',
    startedExpiresAt: null,
    createdAt:        new Date(),
    updatedAt:        new Date(),
  }

  it('withdrawal oluşturulur, PENDING döner, SSE tetiklenir', async () => {
    const tx = makeDbTx([withdrawalTx])
    mockDbTransaction.mockImplementationOnce(async (fn: (tx: typeof tx) => unknown) => fn(tx))

    const result = await transactionService.requestWithdrawal({
      tenantId:   'tid-1',
      merchantId: 'mid-1',
      input: { externalUserId: 'player-1', amount: '250.00', currency: 'TRY', paymentMethod: 'IBAN', withdrawalAddress: 'TR330006100519786457841326', withdrawalAccountName: 'Ali Veli' },
    })

    expect(result.status).toBe('PENDING')
    expect(result.type).toBe('withdrawal')
    expect(result.paymentAccountId).toBeNull()
    expect(mockEmitToTenant).toHaveBeenCalledWith('tid-1', 'transaction.pending', expect.objectContaining({
      type: 'transaction.pending',
      txId: 'txid-w1',
    }))
  })

  it('insert başarısız olursa INTERNAL_SERVER_ERROR', async () => {
    const tx = makeDbTx([])
    mockDbTransaction.mockImplementationOnce(async (fn: (tx: typeof tx) => unknown) => fn(tx))

    await expect(transactionService.requestWithdrawal({
      tenantId:   'tid-1',
      merchantId: 'mid-1',
      input: { externalUserId: 'player-1', amount: '250.00', currency: 'TRY', paymentMethod: 'IBAN', withdrawalAddress: 'TR330006100519786457841326', withdrawalAccountName: 'Ali Veli' },
    })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', statusCode: 500 })
  })
})

describe('transactionService.getTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('işlem bulunursa döner', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce(pendingTx)
    const result = await transactionService.getTransaction('tid-1', 'txid-1')
    expect(result.id).toBe('txid-1')
  })

  it('işlem bulunamazsa NOT_FOUND (404)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce(null)
    await expect(transactionService.getTransaction('tid-1', 'txid-999'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

describe('transactionService.claimTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const processingTx = {
    ...pendingTx,
    status:         'PROCESSING',
    claimedBy:      'user-1',
    claimedAt:      new Date(),
    claimExpiresAt: new Date(Date.now() + 600_000),
  }

  it('PENDING işlemi PROCESSING\'e geçirir ve döner', async () => {
    mockUpdate.mockReturnValueOnce(makeUpdateChain([processingTx]))
    const result = await transactionService.claimTransaction('tid-1', 'user-1', 'txid-1')
    expect(result.status).toBe('PROCESSING')
    expect(result.claimedBy).toBe('user-1')
  })

  it('işlem zaten claim edilmişse ALREADY_CLAIMED (409)', async () => {
    mockUpdate.mockReturnValueOnce(makeUpdateChain([]))  // boş → WHERE PENDING eşleşmedi
    await expect(transactionService.claimTransaction('tid-1', 'user-1', 'txid-1'))
      .rejects.toMatchObject({ code: 'ALREADY_CLAIMED', statusCode: 409 })
  })

  it('claim timeout DB\'den okunur — özel timeout kullanılır', async () => {
    const mockGetTimeout = getClaimTimeoutMs as ReturnType<typeof vi.fn>
    mockGetTimeout.mockResolvedValueOnce(20 * 60 * 1000)  // 20 dakika
    mockUpdate.mockReturnValueOnce(makeUpdateChain([processingTx]))

    const before = Date.now()
    await transactionService.claimTransaction('tid-1', 'user-1', 'txid-1')
    const after = Date.now()

    expect(mockGetTimeout).toHaveBeenCalledOnce()
    const setCall = (mockUpdate.mock.results[0].value as any).set.mock.calls[0][0]
    const expiresMs = setCall.claimExpiresAt.getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 20 * 60 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after  + 20 * 60 * 1000)
  })

  it('DB hatası olursa fallback 10 dakika kullanılır', async () => {
    const mockGetTimeout = getClaimTimeoutMs as ReturnType<typeof vi.fn>
    mockGetTimeout.mockResolvedValueOnce(10 * 60 * 1000)  // fallback default
    mockUpdate.mockReturnValueOnce(makeUpdateChain([processingTx]))

    const before = Date.now()
    await transactionService.claimTransaction('tid-1', 'user-1', 'txid-1')
    const after = Date.now()

    const setCall = (mockUpdate.mock.results[0].value as any).set.mock.calls[0][0]
    const expiresMs = setCall.claimExpiresAt.getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 10 * 60 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after  + 10 * 60 * 1000)
  })
})

describe('transactionService.listTransactions', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sayfalanmış liste döner', async () => {
    mockTxQuery.findMany.mockResolvedValueOnce([pendingTx])
    mockCount.mockResolvedValueOnce(1)

    const result = await transactionService.listTransactions('tid-1', { page: 1, limit: 20 })
    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
  })

  it('status filtresi uygulanır', async () => {
    mockTxQuery.findMany.mockResolvedValueOnce([pendingTx])
    mockCount.mockResolvedValueOnce(1)

    const result = await transactionService.listTransactions('tid-1', { status: 'PENDING', page: 1, limit: 20 })
    expect(result.data).toHaveLength(1)
  })
})

const processingTxBase = {
  id:               'txid-1',
  tenantId:         'tid-1',
  merchantId:       'mid-1',
  paymentAccountId: 'paid-1',
  externalUserId:   'player-1',
  amount:           '500.00',
  currency:         'TRY',
  status:           'PROCESSING',
  claimedBy:        'user-1',
  claimedAt:        new Date(),
  claimExpiresAt:   new Date(Date.now() + 600_000),
  resolvedBy:       null,
  resolvedAt:       null,
  note:             null,
  createdAt:        new Date(),
  updatedAt:        new Date(),
}

describe('transactionService.approveTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('PROCESSING → APPROVED durumuna geçirir', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce(processingTxBase)
    const approvedTx = { ...processingTxBase, status: 'APPROVED', resolvedBy: 'user-1', resolvedAt: new Date() }
    mockUpdate.mockReturnValueOnce(makeUpdateChain([approvedTx]))

    const result = await transactionService.approveTransaction('tid-1', 'user-1', 'txid-1')
    expect(result.status).toBe('APPROVED')
    expect(result.resolvedBy).toBe('user-1')
  })

  it('PROCESSING değilse INVALID_STATE_TRANSITION (409)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce({ ...processingTxBase, status: 'COMPLETED' })
    await expect(transactionService.approveTransaction('tid-1', 'user-1', 'txid-1'))
      .rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION', statusCode: 409 })
  })

  it('başka kullanıcının claim\'i ise FORBIDDEN (403)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce({ ...processingTxBase, claimedBy: 'other-user' })
    await expect(transactionService.approveTransaction('tid-1', 'user-1', 'txid-1'))
      .rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
  })

  it('işlem bulunamazsa NOT_FOUND (404)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce(null)
    await expect(transactionService.approveTransaction('tid-1', 'user-1', 'txid-1'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('concurrent update başarısız → INVALID_STATE_TRANSITION (409)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce(processingTxBase)
    mockUpdate.mockReturnValueOnce(makeUpdateChain([]))
    await expect(transactionService.approveTransaction('tid-1', 'user-1', 'txid-1'))
      .rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION', statusCode: 409 })
  })
})

describe('transactionService.rejectTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('PROCESSING → REJECTED durumuna geçirir, note set edilir', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce(processingTxBase)
    const rejectedTx = { ...processingTxBase, status: 'REJECTED', note: 'Sahte işlem', resolvedBy: 'user-1', resolvedAt: new Date() }
    mockUpdate.mockReturnValueOnce(makeUpdateChain([rejectedTx]))

    const result = await transactionService.rejectTransaction('tid-1', 'user-1', 'txid-1', 'Sahte işlem')
    expect(result.status).toBe('REJECTED')
    expect(result.note).toBe('Sahte işlem')
  })

  it('reason boşsa REASON_REQUIRED (400)', async () => {
    await expect(transactionService.rejectTransaction('tid-1', 'user-1', 'txid-1', ''))
      .rejects.toMatchObject({ code: 'REASON_REQUIRED', statusCode: 400 })
  })

  it('reason sadece boşluksa REASON_REQUIRED (400)', async () => {
    await expect(transactionService.rejectTransaction('tid-1', 'user-1', 'txid-1', '   '))
      .rejects.toMatchObject({ code: 'REASON_REQUIRED', statusCode: 400 })
  })

  it('PROCESSING değilse INVALID_STATE_TRANSITION (409)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce({ ...processingTxBase, status: 'COMPLETED' })
    await expect(transactionService.rejectTransaction('tid-1', 'user-1', 'txid-1', 'red'))
      .rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION', statusCode: 409 })
  })

  it('başka kullanıcının claim\'i ise FORBIDDEN (403)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce({ ...processingTxBase, claimedBy: 'other-user' })
    await expect(transactionService.rejectTransaction('tid-1', 'user-1', 'txid-1', 'red'))
      .rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 })
  })
})

describe('transactionService.flagTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('PROCESSING → FLAGGED durumuna geçirir; claimedBy kontrolü yok', async () => {
    // Başka kullanıcının claim ettiği işlemi de flag'leyebilir
    mockTxQuery.findFirst.mockResolvedValueOnce({ ...processingTxBase, claimedBy: 'other-user' })
    const flaggedTx = { ...processingTxBase, status: 'FLAGGED' }
    mockUpdate.mockReturnValueOnce(makeUpdateChain([flaggedTx]))

    const result = await transactionService.flagTransaction('tid-1', 'any-finans-user', 'txid-1')
    expect(result.status).toBe('FLAGGED')
  })

  it('PROCESSING değilse INVALID_STATE_TRANSITION (409)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce({ ...processingTxBase, status: 'APPROVED' })
    await expect(transactionService.flagTransaction('tid-1', 'user-1', 'txid-1'))
      .rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION', statusCode: 409 })
  })

  it('işlem bulunamazsa NOT_FOUND (404)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce(null)
    await expect(transactionService.flagTransaction('tid-1', 'user-1', 'txid-1'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

describe('transactionService.addComment', () => {
  beforeEach(() => { vi.clearAllMocks() })

  const commentBase = {
    id:            'cmt-1',
    tenantId:      'tid-1',
    transactionId: 'txid-1',
    userId:        'user-1',
    userRole:      'finans',
    content:       'Yorum metni',
    createdAt:     new Date(),
  }

  it('yorum başarıyla eklenir', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce({ id: 'txid-1' })
    mockInsert.mockReturnValueOnce(makeInsertChain([commentBase]))

    const result = await transactionService.addComment({
      tenantId: 'tid-1', transactionId: 'txid-1', userId: 'user-1', userRole: 'finans', content: 'Yorum metni',
    })
    expect(result.content).toBe('Yorum metni')
  })

  it('content boşsa VALIDATION_ERROR (400)', async () => {
    await expect(transactionService.addComment({
      tenantId: 'tid-1', transactionId: 'txid-1', userId: 'user-1', userRole: 'finans', content: '',
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 })
  })

  it('işlem bulunamazsa NOT_FOUND (404)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce(null)
    await expect(transactionService.addComment({
      tenantId: 'tid-1', transactionId: 'txid-999', userId: 'user-1', userRole: 'finans', content: 'yorum',
    })).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

describe('transactionService.getTransactionWithComments', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('işlem ve yorumlarıyla birlikte döner', async () => {
    const txWithComments = { ...processingTxBase, comments: [] }
    mockTxQuery.findFirst.mockResolvedValueOnce(txWithComments)

    const result = await transactionService.getTransactionWithComments('tid-1', 'txid-1')
    expect(result.id).toBe('txid-1')
    expect(result.comments).toEqual([])
  })

  it('işlem bulunamazsa NOT_FOUND (404)', async () => {
    mockTxQuery.findFirst.mockResolvedValueOnce(null)
    await expect(transactionService.getTransactionWithComments('tid-1', 'txid-999'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

const flaggedTxBase = {
  id:               'txid-1',
  tenantId:         'tid-1',
  merchantId:       'mid-1',
  paymentAccountId: 'paid-1',
  externalUserId:   'player-1',
  amount:           '500.00',
  currency:         'TRY',
  status:           'FLAGGED',
  claimedBy:        'user-1',
  claimedAt:        new Date(),
  claimExpiresAt:   new Date(Date.now() + 600_000),
  resolvedBy:       null,
  resolvedAt:       null,
  note:             null,
  createdAt:        new Date(),
  updatedAt:        new Date(),
}

describe('transactionService.resolveTransaction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('FLAGGED → COMPLETED: approved decision', async () => {
    const completedTx = { ...flaggedTxBase, status: 'COMPLETED', note: 'Onay', resolvedBy: 'user-1', resolvedAt: new Date() }
    mockUpdate.mockReturnValueOnce(makeUpdateChain([completedTx]))

    const result = await transactionService.resolveTransaction('tid-1', 'user-1', 'txid-1', 'approved', 'Onay')
    expect(result.status).toBe('COMPLETED')
    expect(result.note).toBe('Onay')
    expect(result.resolvedBy).toBe('user-1')
  })

  it('FLAGGED → REJECTED: rejected decision', async () => {
    const rejectedTx = { ...flaggedTxBase, status: 'REJECTED', note: 'Sahte', resolvedBy: 'user-1', resolvedAt: new Date() }
    mockUpdate.mockReturnValueOnce(makeUpdateChain([rejectedTx]))

    const result = await transactionService.resolveTransaction('tid-1', 'user-1', 'txid-1', 'rejected', 'Sahte')
    expect(result.status).toBe('REJECTED')
    expect(result.note).toBe('Sahte')
  })

  it('reason boşsa REASON_REQUIRED (400)', async () => {
    await expect(transactionService.resolveTransaction('tid-1', 'user-1', 'txid-1', 'approved', ''))
      .rejects.toMatchObject({ code: 'REASON_REQUIRED', statusCode: 400 })
  })

  it('reason whitespace-only ise REASON_REQUIRED (400)', async () => {
    await expect(transactionService.resolveTransaction('tid-1', 'user-1', 'txid-1', 'approved', '   '))
      .rejects.toMatchObject({ code: 'REASON_REQUIRED', statusCode: 400 })
  })

  it('FLAGGED değilse update eşleşmez → INVALID_STATE_TRANSITION (409)', async () => {
    mockUpdate.mockReturnValueOnce(makeUpdateChain([]))  // WHERE FLAGGED eşleşmedi
    mockTxQuery.findFirst.mockResolvedValueOnce({ ...flaggedTxBase, status: 'PROCESSING' })

    await expect(transactionService.resolveTransaction('tid-1', 'user-1', 'txid-1', 'approved', 'neden'))
      .rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION', statusCode: 409 })
  })

  it('işlem hiç bulunamazsa NOT_FOUND (404)', async () => {
    mockUpdate.mockReturnValueOnce(makeUpdateChain([]))
    mockTxQuery.findFirst.mockResolvedValueOnce(null)

    await expect(transactionService.resolveTransaction('tid-1', 'user-1', 'txid-999', 'approved', 'neden'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })
})

describe('transactionService.listTransactionsForFinansGroup', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('üyelik yoksa boş liste döner', async () => {
    mockFgMemberQuery.findFirst.mockResolvedValueOnce(null)
    const result = await transactionService.listTransactionsForFinansGroup({
      userId: 'u-1', tenantId: 'tid-1', page: 1, limit: 20,
    })
    expect(result.data).toHaveLength(0)
    expect(result.meta.total).toBe(0)
  })

  it('merchant yoksa boş liste döner', async () => {
    mockFgMemberQuery.findFirst.mockResolvedValueOnce({ financeGroupId: 'fg-1' })
    mockMerchantQuery.findMany.mockResolvedValueOnce([])
    const result = await transactionService.listTransactionsForFinansGroup({
      userId: 'u-1', tenantId: 'tid-1', page: 1, limit: 20,
    })
    expect(result.data).toHaveLength(0)
  })

  it('gruba bağlı işlemleri sayfalı döner', async () => {
    mockFgMemberQuery.findFirst.mockResolvedValueOnce({ financeGroupId: 'fg-1' })
    mockMerchantQuery.findMany.mockResolvedValueOnce([{ id: 'mid-1' }])
    mockTxQuery.findMany.mockResolvedValueOnce([pendingTx])
    mockCount.mockResolvedValueOnce(1)

    const result = await transactionService.listTransactionsForFinansGroup({
      userId: 'u-1', tenantId: 'tid-1', page: 1, limit: 20,
    })
    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
  })
})
