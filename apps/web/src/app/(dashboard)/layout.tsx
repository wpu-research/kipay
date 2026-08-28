import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { MasqueradeBanner } from '@/components/layout/masquerade-banner'
import { SessionTimeoutGuard } from '@/components/session-timeout-guard'
import { SseProvider } from '@/features/notifications/SseProvider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import type { UserRole } from '@/types/auth'

interface UserInfo {
  id: string
  username: string
  role: UserRole
  tenantId: string
  masquerading?: boolean
  originalUserId?: string
}

async function getUser(): Promise<UserInfo | null | 'error'> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')
  if (!accessToken) return null

  try {
    // P-16 fix: API_INTERNAL_URL kullanılır (NEXT_PUBLIC_ değil — iç URL tarayıcıya açılmaz)
    // P-08 fix: JWT Base64URL zaten URL-safe; encodeURIComponent çift-encoding yapabilir
    // P-07 fix: 5sn timeout — ağ askıda kalırsa SSR sonsuz beklemiyor
    const apiBase = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL
    // P-4: Her iki env değişkeni de tanımsızsa erken çık ve uyarı logla
    if (!apiBase) {
      console.error('[DashboardLayout] API_INTERNAL_URL ve NEXT_PUBLIC_API_URL tanımsız — getUser() başarısız')
      return 'error'
    }
    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      headers: { Cookie: `access_token=${accessToken.value}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    // P-09 fix: 401 ve 403 (tenant/user pasif) her ikisi de login'e yönlendirir
    if (res.status === 401 || res.status === 403) return null
    if (!res.ok) return 'error'
    const data = await res.json() as { user: UserInfo }
    return data.user
  } catch {
    // Ağ hatası — döngüye girmemek için hata işareti döndür
    return 'error'
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (user === null) redirect('/login')
  if (user === 'error') {
    // Sunucu hatası veya ağ sorunu — login döngüsü oluşturmamak için hata sayfası göster
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Sunucuya bağlanılamıyor. Lütfen sayfayı yenileyin.</p>
      </div>
    )
  }

  return (
    <SseProvider>
      <SessionTimeoutGuard>
        {user.masquerading && (
          <MasqueradeBanner targetUsername={user.username} />
        )}
        <SidebarProvider>
          <AppSidebar role={user.role} username={user.username} />
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </SessionTimeoutGuard>
    </SseProvider>
  )
}
