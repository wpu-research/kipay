'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe } from '@/features/auth/use-me'
import { ClaimTimeoutForm } from '@/features/settings/ClaimTimeoutForm'
import { useSettings, useUpdateTotpRequired } from '@/features/settings/use-settings'
import {
  useResetTransactions,
  useResetDailyLimits,
  useResetPaymentAccounts,
  useResetUsersAndTenants,
} from '@/features/system/use-system'

interface ResetCardProps {
  title: string
  description: string
  confirmText: string
  buttonLabel: string
  variant?: 'destructive' | 'outline'
  isPending: boolean
  isDone: boolean
  onConfirm: () => void
}

function ResetCard({ title, description, confirmText, buttonLabel, variant = 'destructive', isPending, isDone, onConfirm }: ResetCardProps) {
  const [input, setInput] = useState('')
  const [step, setStep] = useState<'idle' | 'confirm'>('idle')

  const isMatch = input === confirmText

  function handleDone() {
    setStep('idle')
    setInput('')
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-destructive" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isDone ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-green-600 font-medium">Tamamlandı</span>
            <Button size="sm" variant="outline" onClick={handleDone}>Kapat</Button>
          </div>
        ) : step === 'idle' ? (
          <Button size="sm" variant={variant} onClick={() => setStep('confirm')}>
            {buttonLabel}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Onaylamak için <span className="font-mono font-semibold text-foreground">{confirmText}</span> yazın:
            </p>
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={confirmText}
                className="h-8 text-sm font-mono w-48"
                autoFocus
              />
              <Button
                size="sm"
                variant={variant}
                disabled={!isMatch || isPending}
                onClick={onConfirm}
              >
                {isPending ? 'İşleniyor...' : 'Onayla'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setStep('idle'); setInput('') }}>
                İptal
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const { data: meData } = useMe()
  const role = meData?.user?.role

  const [totpError, setTotpError] = useState('')

  const { data: settingsData } = useSettings()
  const updateTotpRequired = useUpdateTotpRequired()

  const resetTx           = useResetTransactions()
  const resetLimits       = useResetDailyLimits()
  const resetAccounts     = useResetPaymentAccounts()
  const resetUsersTenants = useResetUsersAndTenants()

  async function handleTotpToggle(enabled: boolean) {
    setTotpError('')
    try {
      await updateTotpRequired.mutateAsync({ totpRequired: enabled })
    } catch {
      setTotpError('Ayar güncellenemedi.')
    }
  }

  if (role && !['super_admin', 'firma'].includes(role)) {
    return <p className="p-6 text-sm text-muted-foreground">Bu sayfaya erişim yetkiniz yok.</p>
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Ayarlar</h1>

      {/* 2FA Zorunluluğu — sadece super_admin */}
      {role === 'super_admin' && (
        <Card>
          <CardHeader>
            <CardTitle>İki Faktörlü Doğrulama (2FA)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Giriş sırasında 2FA zorunlu</p>
                <p className="text-xs text-muted-foreground">
                  Kapatıldığında tüm kullanıcılar yalnızca şifre ile giriş yapabilir.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={settingsData?.totpRequired ?? true}
                disabled={updateTotpRequired.isPending}
                onClick={() => handleTotpToggle(!(settingsData?.totpRequired ?? true))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  (settingsData?.totpRequired ?? true) ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    (settingsData?.totpRequired ?? true) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {totpError && <p className="text-sm text-destructive">{totpError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Claim Timeout bölümü */}
      <ClaimTimeoutForm isSuperAdmin={role === 'super_admin'} />

      {/* Veri Sıfırlama — sadece super_admin */}
      {role === 'super_admin' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Veri Sıfırlama</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Bu işlemler geri alınamaz. Yalnızca geliştirme / test ortamında kullanın.</p>
          </div>

          <ResetCard
            title="İşlemleri Sil"
            description="Tüm transaction, yorum ve callback log kayıtları kalıcı olarak silinir."
            confirmText="SIL"
            buttonLabel="Tüm işlemleri sil"
            isPending={resetTx.isPending}
            isDone={resetTx.isSuccess}
            onConfirm={() => resetTx.mutate()}
          />

          <ResetCard
            title="Günlük Limitleri Sıfırla"
            description="Tüm ödeme hesaplarının günlük kullanım sayacı (daily_used) sıfırlanır."
            confirmText="SIFIRLA"
            buttonLabel="Günlük limitleri sıfırla"
            variant="outline"
            isPending={resetLimits.isPending}
            isDone={resetLimits.isSuccess}
            onConfirm={() => resetLimits.mutate()}
          />

          <ResetCard
            title="Ödeme Hesaplarını Sil"
            description="Tüm ödeme hesapları ve ilişkili kayıtlar kalıcı olarak silinir. İşlemlerin önce silinmiş olması gerekir."
            confirmText="HESAPLARI SIL"
            buttonLabel="Tüm hesapları sil"
            isPending={resetAccounts.isPending}
            isDone={resetAccounts.isSuccess}
            onConfirm={() => resetAccounts.mutate()}
          />

          <ResetCard
            title="Kullanıcıları ve Tenantları Sil"
            description="Tüm kullanıcılar, tenantlar ve ilişkili audit log kayıtları kalıcı olarak silinir."
            confirmText="KULLANICILARI SIL"
            buttonLabel="Tüm kullanıcı ve tenantları sil"
            isPending={resetUsersTenants.isPending}
            isDone={resetUsersTenants.isSuccess}
            onConfirm={() => resetUsersTenants.mutate()}
          />

          {(resetTx.isError || resetLimits.isError || resetAccounts.isError || resetUsersTenants.isError) && (
            <p className="text-sm text-destructive">
              {(resetTx.error || resetLimits.error || resetAccounts.error || resetUsersTenants.error as any)?.message ?? 'İşlem başarısız.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
