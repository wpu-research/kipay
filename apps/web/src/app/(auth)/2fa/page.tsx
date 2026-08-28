'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useVerify2FA } from '@/features/auth/use-auth'
import { getRedirectPath } from '@/features/auth/auth-redirect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ApiError } from '@/lib/api-client'
import type { UserRole } from '@/types/auth'

export default function TwoFactorPage() {
  const [code, setCode] = useState('')
  const router = useRouter()
  const verify2FAMutation = useVerify2FA()

  // BS-1 fix: sessionStorage kontrolü kaldırıldı; temp_token httpOnly cookie ile taşınır.
  // Cookie yoksa /2fa/verify API 401 döner, hata mesajı gösterilir.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // BS-1 fix: tempToken body'de gönderilmez; httpOnly cookie otomatik taşınır
      const result = await verify2FAMutation.mutateAsync({ code })
      router.push(getRedirectPath(result.user.role as UserRole))
    } catch (err) {
      const apiErr = err as ApiError
      // P-10 fix: INVALID_TEMP_TOKEN veya tanımsız hata (ağ/500) → login'e yönlendir
      // INVALID_2FA_CODE → sayfada kal, mutation.error üzerinden göster
      if (apiErr?.code === 'INVALID_TEMP_TOKEN' || !apiErr?.code) {
        router.replace('/login')
      }
    }
  }

  const errorMessage = verify2FAMutation.error
    ? (verify2FAMutation.error as ApiError).message ?? 'Doğrulama başarısız'
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>İki Faktörlü Doğrulama</CardTitle>
        <CardDescription>Kimlik doğrulama uygulamanızdaki 6 haneli kodu girin</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="totp">Doğrulama Kodu</Label>
            <Input
              id="totp"
              name="totp"
              type="text"
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
          <Button type="submit" className="w-full" disabled={verify2FAMutation.isPending}>
            {verify2FAMutation.isPending ? 'Doğrulanıyor...' : 'Doğrula'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
