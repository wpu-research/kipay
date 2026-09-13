/**
 * Basit IP-bazlı sabit-pencere rate limiter (in-memory).
 *
 * Not: instance başına çalışır ve redeploy'da sıfırlanır — temel istismar/enumerasyon
 * koruması içindir, dağıtık bir garanti değil. Gateway'deki Fastify rate-limit'in
 * Next route handler karşılığı.
 */
interface Bucket { count: number; resetAt: number }
const g = globalThis as unknown as { __kipayRL?: Map<string, Bucket> }
const buckets: Map<string, Bucket> = (g.__kipayRL ??= new Map())

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

/** true = izin var, false = limit aşıldı. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= max) return false
  b.count++
  return true
}

/** Limit aşılırsa 429 Response döndürür, yoksa null. */
export function enforceRateLimit(req: Request, route: string, max: number, windowMs = 60_000): Response | null {
  const ok = rateLimit(`${route}:${clientIp(req)}`, max, windowMs)
  if (ok) return null
  return new Response(JSON.stringify({ error: 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.' }), {
    status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(windowMs / 1000)) },
  })
}
