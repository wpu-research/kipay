import { describe, it, expect, vi } from 'vitest'

vi.mock('@panel/db', () => ({
  db:  { execute: vi.fn().mockResolvedValue({ rowCount: 5 }) },
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}))

import { nonceCleanup } from './nonce-cleanup.js'
import { db } from '@panel/db'

describe('nonceCleanup', () => {
  it('süresi dolmuş nonce\'ları siler', async () => {
    await nonceCleanup()
    expect((db as any).execute).toHaveBeenCalledOnce()
  })

  it('db.execute hata atarsa hatayı fırlatır', async () => {
    ;(db as any).execute.mockRejectedValueOnce(new Error('DB error'))
    await expect(nonceCleanup()).rejects.toThrow('DB error')
  })
})
