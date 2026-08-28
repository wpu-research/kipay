'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'react-qr-code'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api-client'
import {
  useSessions,
  useRevokeSession,
  useChangePassword,
  type SessionItem,
} from '@/features/auth/use-session'
import {
  use2FAStatus,
  use2FASetup,
  use2FAEnable,
  use2FADisable,
} from '@/features/profile/use-profile-2fa'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function shortUserAgent(ua: string) {
  if (!ua) return 'Bilinmiyor'
  if (ua.length <= 60) return ua
  return ua.slice(0, 57) + '...'
}

function SessionRow({ session, onRevoke, revoking }: {
  session: SessionItem
  onRevoke: (id: string) => void
  revoking: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{session.ip}</span>
          {session.current && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
              Mevcut
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{shortUserAgent(session.userAgent)}</p>
        <p className="text-xs text-muted-foreground">{formatDate(session.createdAt)}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={session.current || revoking}
        onClick={() => onRevoke(session.id)}
      >
        Sonlandır
      </Button>
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()

  // Şifre değiştirme formu
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  // 2FA
  const { data: twoFAData } = use2FAStatus()
  const setup2FA = use2FASetup()
  const enable2FA = use2FAEnable()
  const disable2FA = use2FADisable()
  const [setupState, setSetupState] = useState<{ totpUri: string; setupToken: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [twoFAError, setTwoFAError] = useState<string | null>(null)
  const [twoFASuccess, setTwoFASuccess] = useState<string | null>(null)

  // P-11: setTimeout redirect race — useEffect cleanup ile yönetilir
  const [redirectPending, setRedirectPending] = useState(false)
  useEffect(() => {
    if (!redirectPending) return
    const timer = setTimeout(() => router.push('/login'), 1500)
    return () => clearTimeout(timer)
  }, [redirectPending, router])

  const changePassword = useChangePassword()
  const { data: sessionsData, isLoading: sessionsLoading } = useSessions()
  const revokeSession = useRevokeSession()

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    try {
      await changePassword.mutateAsync({ currentPassword, newPassword })
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      // Tüm oturumlar geçersiz kılındı — login sayfasına yönlendir
      setRedirectPending(true)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_CURRENT_PASSWORD') {
        setPasswordError('Mevcut şifre hatalı.')
      } else {
        setPasswordError('Şifre değiştirilemedi. Lütfen tekrar deneyin.')
      }
    }
  }

  async function handleSetup2FA() {
    setTwoFAError(null)
    setTwoFASuccess(null)
    try {
      const result = await setup2FA.mutateAsync()
      setSetupState(result)
      setTotpCode('')
    } catch {
      setTwoFAError('2FA kurulumu başlatılamadı.')
    }
  }

  async function handleEnable2FA(e: React.FormEvent) {
    e.preventDefault()
    if (!setupState) return
    setTwoFAError(null)
    try {
      await enable2FA.mutateAsync({ code: totpCode, setupToken: setupState.setupToken })
      setSetupState(null)
      setTotpCode('')
      setTwoFASuccess('2FA başarıyla etkinleştirildi.')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_2FA_CODE') {
        setTwoFAError('Geçersiz kod. Lütfen tekrar deneyin.')
      } else if (err instanceof ApiError && err.code === 'INVALID_SETUP_TOKEN') {
        setTwoFAError('Kurulum süresi doldu. Lütfen tekrar başlatın.')
        setSetupState(null)
      } else {
        setTwoFAError('2FA etkinleştirilemedi.')
      }
    }
  }

  async function handleDisable2FA() {
    setTwoFAError(null)
    setTwoFASuccess(null)
    try {
      await disable2FA.mutateAsync()
      setTwoFASuccess('2FA devre dışı bırakıldı.')
    } catch {
      setTwoFAError('2FA devre dışı bırakılamadı.')
    }
  }

  // P-8: mutateAsync + hata mesajı göster
  async function handleRevoke(sessionId: string) {
    setRevokeError(null)
    try {
      await revokeSession.mutateAsync(sessionId)
    } catch {
      setRevokeError('Oturum sonlandırılamadı. Lütfen tekrar deneyin.')
    }
  }

  const sessions = sessionsData?.data ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Profil</h1>

      {/* Şifre Değiştirme */}
      <Card>
        <CardHeader>
          <CardTitle>Şifre Değiştir</CardTitle>
          <CardDescription>
            Şifrenizi değiştirdikten sonra tüm oturumlardan çıkış yapılır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Mevcut Şifre</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Yeni Şifre</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-green-600">
                Şifre güncellendi. Yönlendiriliyorsunuz...
              </p>
            )}
            <Button
              type="submit"
              disabled={changePassword.isPending}
            >
              {changePassword.isPending ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* İki Faktörlü Doğrulama */}
      <Card>
        <CardHeader>
          <CardTitle>İki Faktörlü Doğrulama (2FA)</CardTitle>
          <CardDescription>
            Hesabınıza ekstra güvenlik katmanı ekleyin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {twoFAError && <p className="text-sm text-destructive">{twoFAError}</p>}
          {twoFASuccess && <p className="text-sm text-green-600">{twoFASuccess}</p>}

          {twoFAData?.enabled ? (
            // 2FA etkin
            <div className="space-y-3">
              <p className="text-sm text-green-600 font-medium">2FA etkin.</p>
              <Button
                variant="outline"
                onClick={handleDisable2FA}
                disabled={disable2FA.isPending}
              >
                {disable2FA.isPending ? 'Devre dışı bırakılıyor...' : 'Devre Dışı Bırak'}
              </Button>
            </div>
          ) : setupState ? (
            // Kurulum aşaması: QR kod + doğrulama
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Doğrulayıcı uygulamanızla (Google Authenticator, Authy vb.) aşağıdaki QR kodu tarayın.
              </p>
              <div className="flex justify-center rounded-lg border p-4 bg-white">
                <QRCode value={setupState.totpUri} size={180} />
              </div>
              <form onSubmit={handleEnable2FA} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="totpCode">Doğrulama Kodu</Label>
                  <Input
                    id="totpCode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    required
                    autoComplete="one-time-code"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={enable2FA.isPending || totpCode.length !== 6}>
                    {enable2FA.isPending ? 'Doğrulanıyor...' : 'Doğrula ve Etkinleştir'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { setSetupState(null); setTotpCode(''); setTwoFAError(null) }}
                  >
                    İptal
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            // 2FA devre dışı
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">2FA şu anda devre dışı.</p>
              <Button
                onClick={handleSetup2FA}
                disabled={setup2FA.isPending}
              >
                {setup2FA.isPending ? 'Hazırlanıyor...' : 'Etkinleştir'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aktif Oturumlar */}
      <Card>
        <CardHeader>
          <CardTitle>Aktif Oturumlar</CardTitle>
          <CardDescription>
            Hesabınızda açık olan tüm oturumlar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {revokeError && (
            <p className="mb-2 text-sm text-destructive">{revokeError}</p>
          )}
          {sessionsLoading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aktif oturum bulunamadı.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onRevoke={handleRevoke}
                  revoking={revokeSession.isPending && revokeSession.variables === session.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
