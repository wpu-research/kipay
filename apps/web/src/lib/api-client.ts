// P13: Trailing slash'ı temizle (https://api.example.com/ + /path → double slash önlenir)
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

// Backend hata formatı: { error: { code, message, statusCode } }
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ErrorPayload {
  error?: { code?: string; message?: string; statusCode?: number }
  message?: string
}

// Refresh token dedup: birden fazla eş zamanlı 401 için tek refresh isteği gider
let refreshPromise: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (res.ok && typeof window !== 'undefined') {
      // SessionTimeoutGuard'a timer'ı sıfırlaması için sinyal gönder
      window.dispatchEvent(new Event('session:refreshed'))
    }
    return res.ok
  } catch {
    return false
  }
}

function parseError(text: string, fallbackStatus: number): ApiError {
  let payload: ErrorPayload | null = null
  try { payload = JSON.parse(text) as ErrorPayload } catch { /* ignore */ }
  const err = payload?.error
  return new ApiError(
    err?.code ?? 'UNKNOWN_ERROR',
    err?.message ?? payload?.message ?? 'Bilinmeyen hata',
    err?.statusCode ?? fallbackStatus
  )
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown
): Promise<T> {
  const fetchOptions: RequestInit = {
    method,
    // P12: Content-Type yalnızca body varken gönderilir (GET/DELETE için header gönderilmez)
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    credentials: 'include', // httpOnly cookie'leri gönder (JWT access_token)
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }

  const response = await fetch(`${API_BASE_URL}${path}`, fetchOptions)

  // 401: token yenileyip bir kez daha dene (auth flow endpoint'leri hariç)
  if (response.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/2fa/verify')) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => { refreshPromise = null })
    }
    const refreshed = await refreshPromise

    if (refreshed) {
      // Token yenilendi → orijinal isteği tekrarla
      const retry = await fetch(`${API_BASE_URL}${path}`, fetchOptions)
      if (!retry.ok) {
        const text = await retry.text().catch(() => '')
        throw parseError(text, retry.status)
      }
      if (retry.status === 204) return undefined as T
      const retryText = await retry.text()
      if (!retryText) return undefined as T
      return JSON.parse(retryText) as T
    }

    // Refresh da başarısız → oturum gerçekten sona erdi, login'e yönlendir
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    throw new ApiError('UNAUTHORIZED', 'Oturum sona erdi', 401)
  }

  if (!response.ok) {
    // P11: Standart olmayan hata formatını da yakala ({ message: "..." })
    const text = await response.text().catch(() => '')
    throw parseError(text, response.status)
  }

  if (response.status === 204) return undefined as T

  // P10: 200 + boş body → SyntaxError yerine güvenli undefined döndür
  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export const apiClient = {
  get:    <T>(path: string)                 => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown) => request<T>('POST',   path, body),
  put:    <T>(path: string, body?: unknown) => request<T>('PUT',    path, body),
  patch:  <T>(path: string, body?: unknown) => request<T>('PATCH',  path, body),
  delete: <T>(path: string)                 => request<T>('DELETE',  path),
}
