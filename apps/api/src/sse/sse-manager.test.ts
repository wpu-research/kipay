import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerResponse } from 'node:http'

function makeRes(written: string[] = []): ServerResponse {
  return {
    write: (chunk: string) => { written.push(chunk); return true },
  } as unknown as ServerResponse
}

// Her test kendi sseManager instance'ını kullanır
// Modül-level state izolasyonu için dinamik import + resetModules
describe('sse-manager', () => {
  let addConnection:    (tenantId: string, userId: string, res: ServerResponse) => void
  let removeConnection: (tenantId: string, userId: string, res: ServerResponse) => void
  let emitToTenant:     (tenantId: string, event: string, data: unknown) => void
  let getConnectionCount: (tenantId: string) => number

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./sse-manager.js')
    addConnection    = mod.addConnection
    removeConnection = mod.removeConnection
    emitToTenant     = mod.emitToTenant
    getConnectionCount = mod.getConnectionCount
  })

  describe('addConnection / emitToTenant', () => {
    it('doğru clienta yazar', () => {
      const written: string[] = []
      addConnection('t1', 'u1', makeRes(written))
      emitToTenant('t1', 'transaction.pending', { txId: 'abc' })
      expect(written).toHaveLength(1)
      expect(written[0]).toContain('event: transaction.pending')
      expect(written[0]).toContain('"txId":"abc"')
    })

    it('bilinmeyen tenant için sessizdir', () => {
      expect(() => emitToTenant('unknown', 'evt', {})).not.toThrow()
    })
  })

  describe('removeConnection', () => {
    it('kaldırılan bağlantıya emit etmez', () => {
      const written: string[] = []
      const res = makeRes(written)
      addConnection('t2', 'u2', res)
      removeConnection('t2', 'u2', res)
      emitToTenant('t2', 'transaction.pending', { txId: 'xyz' })
      expect(written).toHaveLength(0)
    })
  })

  describe('birden fazla kullanıcı', () => {
    it('hepsine emit eder', () => {
      const w1: string[] = []; const w2: string[] = []
      addConnection('t3', 'u1', makeRes(w1))
      addConnection('t3', 'u2', makeRes(w2))
      emitToTenant('t3', 'transaction.pending', { txId: '1' })
      expect(w1).toHaveLength(1)
      expect(w2).toHaveLength(1)
    })
  })

  describe('hata veren write', () => {
    it('sessizce atlanır', () => {
      const badRes = {
        write: () => { throw new Error('bağlantı kapalı') },
      } as unknown as ServerResponse
      addConnection('t4', 'u1', badRes)
      expect(() => emitToTenant('t4', 'transaction.pending', {})).not.toThrow()
    })
  })

  describe('getConnectionCount', () => {
    it('doğru sayı döner', () => {
      addConnection('t5', 'u1', makeRes())
      addConnection('t5', 'u2', makeRes())
      expect(getConnectionCount('t5')).toBe(2)
    })

    it('bilinmeyen tenant için 0 döner', () => {
      expect(getConnectionCount('no-tenant')).toBe(0)
    })
  })
})
