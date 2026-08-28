import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

type LayoutUserResult =
  | { kind: 'ok'; role: string }
  | { kind: 'unauthorized' }   // 401/403 veya token yok
  | { kind: 'error' }          // 5xx, timeout, ağ hatası

// IG-1: super_admin olmayan kullanıcılar /tenants route'una doğrudan erişemez
// P-2: 401/403 → /login; diğer hatalar (5xx, timeout) → "servis kullanılamıyor" ekranı
async function getTenantLayoutUser(): Promise<LayoutUserResult> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')
  if (!accessToken) return { kind: 'unauthorized' }

  const apiBase = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL
  if (!apiBase) return { kind: 'error' }

  try {
    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      // Raw value kullan — encodeURIComponent JWT içindeki '.' karakterlerini bozar (P-2 geri alındı)
      headers: { Cookie: `access_token=${accessToken.value}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' }
    if (!res.ok) return { kind: 'error' }
    // P-5: Optional chaining ile güvenli erişim — API response yapısı değişirse unauthorized döner
    const data = (await res.json()) as unknown
    const user = (data as { user?: { role: string } })?.user ?? null
    if (!user) return { kind: 'unauthorized' }
    return { kind: 'ok', role: user.role }
  } catch {
    // Ağ hatası, timeout — kullanıcıyı yetkisiz değil, servis hatası olarak işle
    return { kind: 'error' }
  }
}

export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
  const result = await getTenantLayoutUser()

  if (result.kind === 'error') {
    // 5xx veya timeout — kullanıcıyı login'e atmak yerine hata mesajı göster
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Servis geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.
        </p>
      </div>
    )
  }

  if (result.kind === 'unauthorized' || result.role !== 'super_admin') {
    redirect('/login')
  }

  return <>{children}</>
}
