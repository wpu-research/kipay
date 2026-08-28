'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError } from '@/lib/api-client'
import { useCryptos, useCreateCrypto, useUpdateCryptoStatus } from '@/features/cryptos/use-cryptos'
import { useCurrentRates, useSyncRates } from '@/features/exchange-rates/use-exchange-rates'
import { ExchangeRateHistory } from '@/features/exchange-rates/ExchangeRateHistory'
import type { ExchangeRateItem } from '@panel/types'

export default function CryptosPage() {
  const { data, isLoading } = useCryptos()
  const createCrypto        = useCreateCrypto()
  const updateStatus        = useUpdateCryptoStatus()

  const { data: ratesData } = useCurrentRates()
  const syncRates           = useSyncRates()

  const cryptos = data?.data ?? []
  const rates   = (ratesData as any)?.data ?? []

  const [createOpen, setCreateOpen] = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [form, setForm]             = useState({ name: '', symbol: '' })
  const [syncError, setSyncError]   = useState('')
  const [syncInfo,  setSyncInfo]    = useState('')

  useEffect(() => {
    if (!createOpen) {
      setForm({ name: '', symbol: '' })
      setFormError(null)
    }
  }, [createOpen])

  const isFormValid = form.name.trim().length >= 2 && form.symbol.trim().length >= 1

  function getRateTRY(symbol: string): string | null {
    const rate = rates.find(
      (r: ExchangeRateItem) => r.fromCurrency === symbol && r.toCurrency === 'TRY'
    )
    return rate
      ? parseFloat(rate.rate).toLocaleString('tr-TR', { minimumFractionDigits: 4 })
      : null
  }

  async function handleCreate() {
    setFormError(null)
    try {
      await createCrypto.mutateAsync({
        name:   form.name.trim(),
        symbol: form.symbol.trim().toUpperCase(),
      })
      setCreateOpen(false)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CRYPTO_SYMBOL_CONFLICT') {
        setFormError('Bu sembolle bir kripto zaten mevcut.')
      } else {
        setFormError('Bir hata oluştu.')
      }
    }
  }

  async function handleSync() {
    setSyncError('')
    setSyncInfo('')
    try {
      const result = await syncRates.mutateAsync()
      setSyncInfo(`${(result as any).synced} kur senkronize edildi — kaynak: ${(result as any).source}`)
    } catch (e) {
      setSyncError(e instanceof ApiError ? e.message : 'Senkronizasyon başarısız.')
    }
  }

  const lastSync = rates.length > 0
    ? new Date(rates[0].fetchedAt).toLocaleString('tr-TR')
    : '—'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kripto Paralar</h1>
        <Button onClick={() => setCreateOpen(true)}>Kripto Ekle</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sembol</TableHead>
              <TableHead>Ad</TableHead>
              <TableHead>Güncel Kur (TRY)</TableHead>
              <TableHead className="w-[100px]">Durum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Yükleniyor...
                </TableCell>
              </TableRow>
            ) : cryptos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Henüz kripto para eklenmemiş.
                </TableCell>
              </TableRow>
            ) : (
              cryptos.map((crypto) => {
                const rateTRY = getRateTRY(crypto.symbol)
                return (
                  <TableRow key={crypto.id} className={!crypto.isActive ? 'opacity-50' : ''}>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono">{crypto.symbol}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{crypto.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {rateTRY ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={crypto.isActive}
                        onCheckedChange={(checked) =>
                          updateStatus.mutate({ id: crypto.id, isActive: checked })
                        }
                      />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Kur Senkronizasyonu */}
      <Card>
        <CardHeader>
          <CardTitle>Kur Senkronizasyonu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Son senkronizasyon: <span className="font-medium text-foreground">{lastSync}</span>
          </p>
          {syncError && <p className="text-sm text-red-600">{syncError}</p>}
          {syncInfo  && <p className="text-sm text-green-600">{syncInfo}</p>}
          <Button onClick={handleSync} disabled={syncRates.isPending} variant="outline">
            {syncRates.isPending ? 'Senkronize ediliyor...' : 'Şimdi Senkronize Et'}
          </Button>
        </CardContent>
      </Card>

      {/* Kur geçmişi */}
      <ExchangeRateHistory />

      <Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Yeni Kripto Para</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Sembol *</label>
              <Input
                value={form.symbol}
                onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                placeholder="Örn: BTC"
                maxLength={10}
                className="font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Ad *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Örn: Bitcoin"
              />
            </div>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createCrypto.isPending}>
              İptal
            </Button>
            <Button onClick={handleCreate} disabled={createCrypto.isPending || !isFormValid}>
              {createCrypto.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
