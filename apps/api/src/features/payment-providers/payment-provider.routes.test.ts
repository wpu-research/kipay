import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@panel/db', () => ({
  db: {
    query: {
      tenants:  { findFirst: vi.fn() },
      sessions: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
  auditLogs:                 {},
  paymentProviders:          {},
  paymentProviderCategories: {},
  users:     {},
  sessions:  {},
  tenants:   {},
  eq:     vi.fn((col, val) => ({ col, val })),
  and:    vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col, isNull: true })),
  gt:     vi.fn((col, val) => ({ col, val, gt: true })),
  sql:    vi.fn((strings: TemplateStringsArray) => strings[0]),
}))

vi.mock('./payment-provider.service.js', () => ({
  paymentProviderService: {
    createProvider:  vi.fn(),
    getProviders:    vi.fn(),
    updateProvider:  vi.fn(),
    createCategory:  vi.fn(),
    getCategories:   vi.fn(),
    updateCategory:  vi.fn(),
  },
}))

import { db } from '@panel/db'
import { paymentProviderService } from './payment-provider.service.js'
import { buildApp } from '../../app.js'

const mockService = paymentProviderService as unknown as {
  createProvider:  ReturnType<typeof vi.fn>
  getProviders:    ReturnType<typeof vi.fn>
  updateProvider:  ReturnType<typeof vi.fn>
  createCategory:  ReturnType<typeof vi.fn>
  getCategories:   ReturnType<typeof vi.fn>
  updateCategory:  ReturnType<typeof vi.fn>
}

const mockDbQuery = db.query as unknown as {
  tenants:  { findFirst: ReturnType<typeof vi.fn> }
  sessions: { findFirst: ReturnType<typeof vi.fn> }
}

const TENANT_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID     = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const PROVIDER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const CATEGORY_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

const activeTenant  = { id: TENANT_ID, status: 'active' as const }
const activeSession = { id: SESSION_ID, revokedAt: null }

const mockProvider = {
  id:        PROVIDER_ID,
  tenantId:  TENANT_ID,
  name:      'Test Sağlayıcı',
  status:    'active' as const,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const mockCategory = {
  id:        CATEGORY_ID,
  tenantId:  TENANT_ID,
  name:      'Havale',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

describe('Payment Provider Routes', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => { vi.clearAllMocks() })

  function makeToken(role: 'super_admin' | 'firma' | 'finans' | 'merchant' | 'operator') {
    return app.jwt.sign({
      userId:    USER_ID,
      username:  `testuser_${role}`,
      role,
      tenantId:  TENANT_ID,
      sessionId: SESSION_ID,
    })
  }

  function setupAuth() {
    mockDbQuery.sessions.findFirst.mockResolvedValueOnce(activeSession)
    mockDbQuery.tenants.findFirst.mockResolvedValueOnce(activeTenant)
  }

  // --- POST /api/v1/payment-providers ---

  describe('POST /api/v1/payment-providers', () => {
    it('firma rolü → 201 döner', async () => {
      setupAuth()
      mockService.createProvider.mockResolvedValueOnce(mockProvider)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'Test Sağlayıcı' },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().data.name).toBe('Test Sağlayıcı')
    })

    it('super_admin → 201 döner', async () => {
      setupAuth()
      mockService.createProvider.mockResolvedValueOnce(mockProvider)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers',
        headers: { authorization: `Bearer ${makeToken('super_admin')}` },
        payload: { name: 'Test Sağlayıcı' },
      })

      expect(res.statusCode).toBe(201)
    })

    it('merchant rolü → 403 FORBIDDEN', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers',
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
        payload: { name: 'Test Sağlayıcı' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('finans rolü → 403 FORBIDDEN', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers',
        headers: { authorization: `Bearer ${makeToken('finans')}` },
        payload: { name: 'Test Sağlayıcı' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('operator rolü → 403 FORBIDDEN', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers',
        headers: { authorization: `Bearer ${makeToken('operator')}` },
        payload: { name: 'Test Sağlayıcı' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('kimlik doğrulama yok → 401', async () => {
      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers',
        payload: { name: 'Test Sağlayıcı' },
      })

      expect(res.statusCode).toBe(401)
    })

    it('çakışma → 409 PROVIDER_NAME_CONFLICT', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.createProvider.mockRejectedValueOnce(new AppError('PROVIDER_NAME_CONFLICT', 'Bu sağlayıcı adı zaten kullanılıyor.', 409))

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'Test Sağlayıcı' },
      })

      expect(res.statusCode).toBe(409)
    })
  })

  // --- GET /api/v1/payment-providers ---

  describe('GET /api/v1/payment-providers', () => {
    it('firma → 200, { data, meta }', async () => {
      setupAuth()
      mockService.getProviders.mockResolvedValueOnce({ data: [mockProvider], meta: { total: 1, page: 1, limit: 20 } })

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/payment-providers',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
      expect(res.json().meta.total).toBe(1)
    })

    it('merchant → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/payment-providers',
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('kimlik doğrulama yok → 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url:    '/api/v1/payment-providers',
      })

      expect(res.statusCode).toBe(401)
    })
  })

  // --- PUT /api/v1/payment-providers/:id ---

  describe('PUT /api/v1/payment-providers/:id', () => {
    it('firma → 200', async () => {
      setupAuth()
      mockService.updateProvider.mockResolvedValueOnce({ ...mockProvider, name: 'Yeni Ad' })

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-providers/${PROVIDER_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'Yeni Ad' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.name).toBe('Yeni Ad')
    })

    it('merchant → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-providers/${PROVIDER_ID}`,
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
        payload: { name: 'Yeni Ad' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('mevcut olmayan → 404', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.updateProvider.mockRejectedValueOnce(new AppError('NOT_FOUND', 'Bulunamadı.', 404))

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-providers/${PROVIDER_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'Yeni Ad' },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  // --- POST /api/v1/payment-providers/categories ---

  describe('POST /api/v1/payment-providers/categories', () => {
    it('firma → 201', async () => {
      setupAuth()
      mockService.createCategory.mockResolvedValueOnce(mockCategory)

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers/categories',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'Havale' },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().data.name).toBe('Havale')
    })

    it('merchant → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers/categories',
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
        payload: { name: 'Havale' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('çakışma → 409 CATEGORY_NAME_CONFLICT', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.createCategory.mockRejectedValueOnce(new AppError('CATEGORY_NAME_CONFLICT', 'Bu kategori adı zaten kullanılıyor.', 409))

      const res = await app.inject({
        method:  'POST',
        url:     '/api/v1/payment-providers/categories',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'Havale' },
      })

      expect(res.statusCode).toBe(409)
    })
  })

  // --- GET /api/v1/payment-providers/categories ---

  describe('GET /api/v1/payment-providers/categories', () => {
    it('firma → 200, { data, meta }', async () => {
      setupAuth()
      mockService.getCategories.mockResolvedValueOnce({ data: [mockCategory], meta: { total: 1, page: 1, limit: 20 } })

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/payment-providers/categories',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data).toHaveLength(1)
      expect(res.json().meta.total).toBe(1)
    })

    it('merchant → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/payment-providers/categories',
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  // --- PUT /api/v1/payment-providers/categories/:id ---

  describe('PUT /api/v1/payment-providers/categories/:id', () => {
    it('firma → 200', async () => {
      setupAuth()
      mockService.updateCategory.mockResolvedValueOnce({ ...mockCategory, name: 'EFT' })

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-providers/categories/${CATEGORY_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'EFT' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().data.name).toBe('EFT')
    })

    it('merchant → 403', async () => {
      setupAuth()

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-providers/categories/${CATEGORY_ID}`,
        headers: { authorization: `Bearer ${makeToken('merchant')}` },
        payload: { name: 'EFT' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('mevcut olmayan → 404', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.updateCategory.mockRejectedValueOnce(new AppError('NOT_FOUND', 'Bulunamadı.', 404))

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-providers/categories/${CATEGORY_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'EFT' },
      })

      expect(res.statusCode).toBe(404)
    })

    it('çakışma → 409 CATEGORY_NAME_CONFLICT', async () => {
      setupAuth()
      const { AppError } = await import('../../errors/app-error.js')
      mockService.updateCategory.mockRejectedValueOnce(new AppError('CATEGORY_NAME_CONFLICT', 'Bu kategori adı zaten kullanılıyor.', 409))

      const res = await app.inject({
        method:  'PUT',
        url:     `/api/v1/payment-providers/categories/${CATEGORY_ID}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
        payload: { name: 'Havale' },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().code).toBe('CATEGORY_NAME_CONFLICT')
    })
  })

  // --- Pagination validation ---

  describe('GET /api/v1/payment-providers — pagination edge cases', () => {
    it.each([
      ['page=0',     '?page=0'],
      ['limit=0',    '?limit=0'],
      ['limit=101',  '?limit=101'],
      ['page=1001',  '?page=1001'],
    ])('%s → 400', async (_label, qs) => {
      setupAuth()
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/payment-providers${qs}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/v1/payment-providers/categories — pagination edge cases', () => {
    it.each([
      ['page=0',     '?page=0'],
      ['limit=0',    '?limit=0'],
      ['limit=101',  '?limit=101'],
      ['page=1001',  '?page=1001'],
    ])('%s → 400', async (_label, qs) => {
      setupAuth()
      const res = await app.inject({
        method:  'GET',
        url:     `/api/v1/payment-providers/categories${qs}`,
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // --- Date serialization ---

  describe('date serialization', () => {
    it('provider createdAt/updatedAt string olarak serialize edilir', async () => {
      setupAuth()
      mockService.getProviders.mockResolvedValueOnce({ data: [mockProvider], meta: { total: 1, page: 1, limit: 20 } })

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/payment-providers',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      const provider = res.json().data[0]
      expect(typeof provider.createdAt).toBe('string')
      expect(typeof provider.updatedAt).toBe('string')
      expect(() => new Date(provider.createdAt)).not.toThrow()
      expect(new Date(provider.createdAt).toISOString()).toBe('2026-01-01T00:00:00.000Z')
    })

    it('category createdAt/updatedAt string olarak serialize edilir', async () => {
      setupAuth()
      mockService.getCategories.mockResolvedValueOnce({ data: [mockCategory], meta: { total: 1, page: 1, limit: 20 } })

      const res = await app.inject({
        method:  'GET',
        url:     '/api/v1/payment-providers/categories',
        headers: { authorization: `Bearer ${makeToken('firma')}` },
      })

      const category = res.json().data[0]
      expect(typeof category.createdAt).toBe('string')
      expect(typeof category.updatedAt).toBe('string')
      expect(() => new Date(category.createdAt)).not.toThrow()
      expect(new Date(category.createdAt).toISOString()).toBe('2026-01-01T00:00:00.000Z')
    })
  })
})
