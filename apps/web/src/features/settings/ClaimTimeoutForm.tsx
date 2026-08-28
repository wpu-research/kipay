'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api-client'
import { useSettings, useUpdateClaimTimeout } from './use-settings'

interface Props {
  isSuperAdmin: boolean
}

export function ClaimTimeoutForm({ isSuperAdmin }: Props) {
  const { data, isLoading } = useSettings()
  const updateTimeout = useUpdateClaimTimeout()
  const [value, setValue] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const currentMinutes = (data as any)?.claimTimeoutMinutes ?? '—'

  async function handleSave() {
    setSuccess('')
    setError('')
    const minutes = parseInt(value, 10)
    if (isNaN(minutes) || minutes < 5 || minutes > 60) {
      setError('Geçerli bir değer girin (5–60 dakika arası).')
      return
    }
    try {
      await updateTimeout.mutateAsync({ timeoutMinutes: minutes })
      setSuccess(`Claim timeout ${minutes} dakika olarak güncellendi.`)
      setValue('')
    } catch (e) {
      setValue('')
      setError(e instanceof ApiError ? e.message : 'Güncelleme başarısız.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Claim Timeout</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Mevcut süre:{' '}
          <span className="font-medium text-foreground">
            {isLoading ? 'Yükleniyor...' : `${currentMinutes} dakika`}
          </span>
        </p>

        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={5}
              max={60}
              placeholder="5–60 dakika"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-36"
            />
            <Button
              onClick={handleSave}
              disabled={updateTimeout.isPending}
              variant="outline"
            >
              {updateTimeout.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        )}

        {success && <p className="text-sm text-green-600">{success}</p>}
        {error   && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
