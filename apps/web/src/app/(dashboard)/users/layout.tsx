import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// /users erişimine izin verilen roller
// merchant da backend'de user yönetimi endpointlerine erişebilir (yalnızca operator rolü atayabilir)
const ALLOWED_ROLES = ['super_admin', 'tenant_admin'] as const

type LayoutUserResult =
  | { kind: 'ok'; role: string }
  | { kind: 'unauthorized' }
  | { kind: 'error' }

async function getUsersLayoutUser(): Promise<LayoutUserResult> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('access_token')
  if (!accessToken) return { kind: 'unauthorized' }

  const apiBase = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL
  if (!apiBase) return { kind: 'error' }

  try {
    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      headers: { Cookie: `access_token=${accessToken.value}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' }
    if (!res.ok) return { kind: 'error' }
    const data = (await res.json()) as unknown
    const user = (data as { user?: { role: string } })?.user ?? null
    if (!user) return { kind: 'unauthorized' }
    return { kind: 'ok', role: user.role }
  } catch {
    return { kind: 'error' }
  }
}

export default async function UsersLayout({ children }: { children: React.ReactNode }) {
  const result = await getUsersLayoutUser()

  if (result.kind === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Servis geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.
        </p>
      </div>
    )
  }

  if (result.kind === 'unauthorized' || !(ALLOWED_ROLES as readonly string[]).includes(result.role)) {
    redirect('/login')
  }

  return <>{children}</>
}
