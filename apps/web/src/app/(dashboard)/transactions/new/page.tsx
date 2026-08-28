'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMe } from '@/features/auth/use-me'
import { useMerchants } from '@/features/merchants/use-merchants'
import { useTransactions, useClaimTransaction } from '@/features/transactions/use-transactions'
import { useCreateManualWithdrawal } from '@/features/transactions/use-manual-withdrawal'
import { ApiError } from '@/lib/api-client'

const PAYMENT_METHODS = [
  { value: 'IBAN', label: 'IBAN / Havale' },
  { value: 'Fast', label: 'Fast' },
  { value: 'EFT',  label: 'EFT' },
]

function ManualWithdrawalForm({ merchants }: { merchants: { id: string; merchantName: string }[] }) {
  const router = useRouter()
  const createWithdrawal = useCreateManualWithdrawal()

  const [form, setForm] = useState({
    merchantId:            '',
    externalUserId:        '',
    amount:                '',
    currency:              'TRY',
    paymentMethod:         'IBAN',
    withdrawalAddress:     '',
    withdrawalAccountName: '',
  })
  const [error, setError] = useState<string | null>(null)

  const isValid =
    form.merchantId && form.externalUserId.trim() &&
    form.amount && /^\d+(\.\d{1,2})?$/.test(form.amount) &&
    form.currency.trim() &&
    form.withdrawalAddress.trim() && form.withdrawalAccountName.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createWithdrawal.mutateAsync(form)
      toast.success('Çekim talebi oluşturuldu')
      router.push('/transactions')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İşlem oluşturulamadı.')
    }
  }

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Site *</label>
          <Select value={form.merchantId || '_none'} onValueChange={(v) => set('merchantId', v === '_none' ? '' : v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Site seçin" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Site seçin</SelectItem>
              {merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.merchantName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kullanıcı Adı (externalUserId) *</label>
          <Input className="h-9" placeholder="oyuncu123" value={form.externalUserId} onChange={(e) => set('externalUserId', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tutar *</label>
          <Input className="h-9 font-mono" placeholder="500.00" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Para Birimi</label>
          <Input className="h-9 font-mono" value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ödeme Yöntemi *</label>
          <Select value={form.paymentMethod} onValueChange={(v) => set('paymentMethod', v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hesap Sahibi Adı *</label>
          <Input className="h-9" placeholder="AD SOYAD" value={form.withdrawalAccountName} onChange={(e) => set('withdrawalAccountName', e.target.value)} />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {form.paymentMethod === 'IBAN' ? 'IBAN *' : 'Hesap No / Adres *'}
          </label>
          <Input
            className="h-9 font-mono"
            placeholder={form.paymentMethod === 'IBAN' ? 'TR33000610...' : 'Hesap numarası'}
            value={form.withdrawalAddress}
            onChange={(e) => set('withdrawalAddress', e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={createWithdrawal.isPending || !isValid} className="h-9">
          {createWithdrawal.isPending ? 'Oluşturuluyor...' : 'Çekim Talebi Oluştur'}
        </Button>
        <Button type="button" variant="outline" className="h-9" onClick={() => router.push('/transactions')}>
          İptal
        </Button>
      </div>
    </form>
  )
}

export default function TransactionsNewPage() {
  const { data: meData }    = useMe()
  const userId              = meData?.user?.id ?? ''
  const tenantId            = meData?.user?.tenantId ?? ''
  const canCreate           = ['tenant_admin', 'finans_admin'].includes(meData?.user?.role ?? '')
  const { data: merchantsData } = useMerchants(1, 100, undefined, canCreate)
  const merchants           = merchantsData?.data ?? []
  const claimTx             = useClaimTransaction()

  const { data: pendingData, isLoading } = useTransactions(tenantId, userId, {
    type: 'withdrawal', status: 'PENDING', limit: 50,
  })

  const pending = pendingData?.data ?? []

  async function handleClaim(txId: string) {
    try {
      await claimTx.mutateAsync(txId)
      toast.success('İşlem alındı')
    } catch {
      toast.error('İşlem alınamadı')
    }
  }

  return (
    <div className="space-y-6">
      {/* Pending withdrawal pool */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Çekim Talebi Al — Yeni Durumundaki Talepler</span>
          <span className="text-xs text-muted-foreground font-mono">
            Sadece <span className="text-cyan-400">Yeni</span> statüsü gösteriliyor
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Site</th>
                  <th className="px-4 py-2">Kullanıcı</th>
                  <th className="px-4 py-2">Banka</th>
                  <th className="px-4 py-2">Miktar</th>
                  <th className="px-4 py-2">Durum</th>
                  <th className="px-4 py-2">Talep Tarihi</th>
                  <th className="px-4 py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-muted-foreground">
                      Bekleyen çekim talebi yok.
                    </td>
                  </tr>
                ) : pending.map((tx) => (
                  <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-muted-foreground">{tx.id.slice(0, 8)}</td>
                    <td className="px-4 py-2">
                      {tx.merchantName ? (
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          {tx.merchantName}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2 font-medium">{tx.externalUserId}</td>
                    <td className="px-4 py-2 text-muted-foreground">{tx.paymentAccountName ?? '—'}</td>
                    <td className="px-4 py-2 font-bold font-mono">
                      {parseFloat(tx.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {tx.currency}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Yeni
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2">
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        disabled={claimTx.isPending}
                        onClick={() => handleClaim(tx.id)}
                      >
                        İşlemi Al
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual creation form */}
      {canCreate && (
        <div className="rounded-lg border bg-card p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Manuel Çekim Talebi Oluştur</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Sistem üzerinden doğrudan çekim işlemi oluştur</p>
          </div>
          <ManualWithdrawalForm merchants={merchants} />
        </div>
      )}
    </div>
  )
}
