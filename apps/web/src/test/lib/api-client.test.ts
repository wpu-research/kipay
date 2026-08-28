import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiError, apiClient } from '@/lib/api-client'

describe('ApiError', () => {
  it('doğru özellikleri taşır', () => {
    const err = new ApiError('NOT_FOUND', 'Bulunamadı', 404)
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('Bulunamadı')
    expect(err.statusCode).toBe(404)
    expect(err.name).toBe('ApiError')
  })
})

describe('apiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // text() kullanacak şekilde güncellendi (P10 fix)
  const makeResponse = (status: number, body: unknown, rawText?: string) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: () =>
        Promise.resolve(
          rawText !== undefined
            ? rawText
            : body !== null && body !== undefined
              ? JSON.stringify(body)
              : ''
        ),
    }) as unknown as Response

  it('GET başarılı yanıt döndürür', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, { id: 1 }))
    const result = await apiClient.get<{ id: number }>('/test')
    expect(result).toEqual({ id: 1 })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    )
  })

  it('POST body ile istek gönderir', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(201, { id: 2 }))
    await apiClient.post('/items', { name: 'test' })
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      })
    )
  })

  it('204 yanıtında undefined döndürür', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(204, null))
    const result = await apiClient.delete('/items/1')
    expect(result).toBeUndefined()
  })

  it('4xx hata için ApiError fırlatır', async () => {
    const errorResponse = makeResponse(404, {
      error: { code: 'NOT_FOUND', message: 'Bulunamadı', statusCode: 404 },
    })
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse)
    await expect(apiClient.get('/missing')).rejects.toThrow(ApiError)
  })

  it('4xx ApiError doğru code ve statusCode taşır', async () => {
    const errorResponse = makeResponse(404, {
      error: { code: 'NOT_FOUND', message: 'Bulunamadı', statusCode: 404 },
    })
    vi.mocked(fetch).mockResolvedValueOnce(errorResponse)
    await expect(apiClient.get('/missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })

  it('5xx hata için ApiError fırlatır', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(500, { error: { code: 'SERVER_ERROR', message: 'Sunucu hatası', statusCode: 500 } })
    )
    await expect(apiClient.get('/fail')).rejects.toThrow(ApiError)
  })

  it('credentials: include ile istek gönderir', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, {}))
    await apiClient.get('/auth-protected')
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' })
    )
  })

  it('PATCH metodu ile istek gönderir', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, { updated: true }))
    await apiClient.patch('/items/1', { status: 'active' })
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('PUT metodu ile istek gönderir', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, { ok: true }))
    await apiClient.put('/items/1', { name: 'updated' })
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'PUT' })
    )
  })

  // P10: 200 + boş body → undefined döndürülmeli (SyntaxError değil)
  it('200 ile boş body geldiğinde undefined döndürür', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, null, ''))
    const result = await apiClient.get('/empty-body')
    expect(result).toBeUndefined()
  })

  // P11: Standart dışı hata body'si → gerçek mesaj korunmalı
  it('standart dışı hata formatında mesajı korur', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      makeResponse(400, { message: 'Geçersiz istek' })
    )
    await expect(apiClient.get('/bad')).rejects.toMatchObject({
      message: 'Geçersiz istek',
    })
  })

  // P12: GET isteğinde Content-Type header gönderilmemeli
  it('GET isteğinde Content-Type header göndermez', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, {}))
    await apiClient.get('/no-content-type')
    const callArgs = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(callArgs.headers).not.toHaveProperty('Content-Type')
  })

  // P12: POST isteğinde Content-Type header gönderilmeli
  it('POST isteğinde Content-Type: application/json gönderir', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(201, { ok: true }))
    await apiClient.post('/data', { foo: 'bar' })
    const callArgs = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(callArgs.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  // P13: Trailing slash → double slash oluşmamalı (protokoldeki // hariç)
  it('API_BASE_URL trailing slash varsa double-slash oluşturmaz', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeResponse(200, {}))
    await apiClient.get('/transactions')
    const url = vi.mocked(fetch).mock.calls[0][0] as string
    // http:// veya https:// protokol kısmını çıkar, geri kalanında // olmamalı
    const urlWithoutProtocol = url.replace(/^https?:\/\//, '')
    expect(urlWithoutProtocol).not.toContain('//')
    expect(url).toContain('/transactions')
  })
})
