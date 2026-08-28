'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api-client'
import { CreateUserSchema } from '@panel/types'
import { useCreateUser } from '@/features/users/use-users'
import { useMe } from '@/features/auth/use-auth'
import { useTenants } from '@/features/tenants/use-tenants'
import { useMerchants } from '@/features/merchants/use-merchants'

const ALL_ROLE_OPTIONS = [
  { value: 'tenant_admin',    label: 'Tenant Admin' },
  { value: 'finans_admin',    label: 'Finans Admin' },
  { value: 'finans_operator', label: 'Finans Operator' },
  { value: 'merchant',        label: 'Merchant' },
] as const

type AssignableRole = 'tenant_admin' | 'finans_admin' | 'finans_operator' | 'merchant'

export default function NewUserPage() {
  const router = useRouter()
  const createUser = useCreateUser()
  const { data: meData, isPending: isMeLoading } = useMe()
  const actorRole    = meData?.user?.role
  const isSuperAdmin = actorRole === 'super_admin'

  const { data: tenantsData } = useTenants(1, 100, { enabled: isSuperAdmin })
  const tenants = tenantsData?.data ?? []

  const [username,   setUsername]   = useState('')
  const [password,   setPassword]   = useState('')
  const [role,       setRole]       = useState<AssignableRole>('finans_operator')
  const [tenantId,   setTenantId]   = useState('')
  const [merchantId, setMerchantId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isMerchantRole = role === 'merchant'

  const { data: merchantsData } = useMerchants(1, 100)
  const merchants = merchantsData?.data ?? []

  function handleRoleChange(newRole: AssignableRole) {
    setRole(newRole)
    setMerchantId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (isSuperAdmin && !isMerchantRole && !tenantId) {
      setError('Tenant seçimi zorunludur.')
      return
    }

    if (isMerchantRole && !merchantId) {
      setError('Merchant seçimi zorunludur.')
      return
    }

    const payload = {
      username,
      password,
      role,
      ...(isSuperAdmin && !isMerchantRole && tenantId ? { tenantId } : {}),
      ...(isMerchantRole && merchantId ? { merchantId } : {}),
    }
    const validation = CreateUserSchema.safeParse(payload)
    if (!validation.success) {
      const firstError = validation.error.errors[0]
      setError(firstError?.message ?? 'Geçersiz değerler.')
      return
    }

    try {
      const result = await createUser.mutateAsync(payload)
      toast.success(`'${result.data.user.username}' kullanıcısı oluşturuldu.`)
      router.push('/users')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'USER_EXISTS') {
          setError(`'${username}' kullanıcı adı zaten kullanımda. Farklı bir kullanıcı adı deneyin.`)
        } else {
          setError(err.message)
        }
      } else {
        setError('Kullanıcı oluşturulamadı. Lütfen tekrar deneyin.')
      }
    }
  }


  const isSubmitDisabled =
    createUser.isPending ||
    isMeLoading ||
    (isSuperAdmin && !isMerchantRole && !tenantId) ||
    (isMerchantRole && !merchantId)

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Yeni Kullanıcı</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kullanıcı Bilgileri</CardTitle>
          <CardDescription>
            Tenant kapsamında yeni kullanıcı oluşturun.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Kullanıcı Adı</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Örn: ali_operator"
                minLength={3}
                maxLength={64}
                required
              />
              <p className="text-xs text-muted-foreground">
                Yalnızca küçük harf, rakam, tire ve alt çizgi kullanılabilir.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 8 karakter"
                minLength={8}
                maxLength={128}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role">Rol</Label>
              <Select
                value={role}
                onValueChange={(v) => handleRoleChange(v as AssignableRole)}
                disabled={isMeLoading}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLE_OPTIONS.filter(o => isSuperAdmin || o.value !== 'tenant_admin').map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isSuperAdmin && !isMerchantRole && (
              <div className="space-y-1.5">
                <Label htmlFor="tenantId">Tenant</Label>
                <Select value={tenantId || '_none'} onValueChange={(v) => setTenantId(v === '_none' ? '' : v)}>
                  <SelectTrigger id="tenantId">
                    <SelectValue placeholder="Tenant seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Tenant seçin</SelectItem>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isMerchantRole && (
              <div className="space-y-1.5">
                <Label htmlFor="merchantId">Merchant</Label>
                <Select value={merchantId || '_none'} onValueChange={(v) => setMerchantId(v === '_none' ? '' : v)}>
                  <SelectTrigger id="merchantId">
                    <SelectValue placeholder="Merchant seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Merchant seçin</SelectItem>
                    {merchants.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.merchantName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitDisabled}>
                {createUser.isPending ? 'Oluşturuluyor...' : 'Oluştur'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/users')}
              >
                İptal
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
