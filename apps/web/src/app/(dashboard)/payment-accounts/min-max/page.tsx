'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePaymentAccounts } from '@/features/payment-accounts/use-payment-accounts'
import { useBanks } from '@/features/banks/use-banks'
import type { PaymentAccount } from '@panel/types'

function LimitBar({ used, limit }: { used: string; limit: string }) {
  const u = parseFloat(used)
  const l = parseFloat(limit)
  const pct = l <= 0 ? 0 : Math.min(100, (u / l) * 100)
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-1">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground font-mono">
        {parseFloat(used).toLocaleString('tr-TR')} / {parseFloat(limit).toLocaleString('tr-TR')} ₺
        <span className="ml-1 opacity-60">({pct.toFixed(0)}%)</span>
      </p>
    </div>
  )
}

function AccountRow({ account }: { account: PaymentAccount }) {
  const bankName = account.bank?.name
    || account.cryptos.map((c) => c.symbol).join(', ')
    || '—'

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 font-mono text-muted-foreground text-[11px]">{account.id.slice(0, 8)}</td>
      <td className="px-4 py-3">
        <span className="text-[10px] font-bold font-mono text-muted-foreground">{bankName}</span>
      </td>
      <td className="px-4 py-3 font-medium text-sm max-w-[200px] truncate">{account.name}</td>
      <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground max-w-[180px] truncate">
        {account.accountNumber}
      </td>
      <td className="px-4 py-3 min-w-[160px]">
        <LimitBar used={account.dailyUsed} limit={account.dailyLimit} />
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono border ${
          account.status === 'active'
            ? 'bg-green-500/10 text-green-400 border-green-500/20'
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          {account.status === 'active' ? 'Aktif' : 'Pasif'}
        </span>
      </td>
    </tr>
  )
}

export default function PaymentAccountMinMaxPage() {
  const [filterType, setFilterType]   = useState<'bank' | 'crypto' | ''>('')
  const [filterBankId, setFilterBankId] = useState('')
  const [page, setPage]               = useState(1)
  const limit = 50

  const { data: banksData } = useBanks()
  const banks = (banksData?.data ?? []).filter((b) => b.isActive)

  const { data, isLoading, isError } = usePaymentAccounts(
    { status: 'active', type: filterType || undefined, bankId: filterBankId || undefined },
    page,
    limit,
  )

  const accounts    = data?.data ?? []
  const meta        = data?.meta
  const totalPages  = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1
  const currentPage = meta?.page ?? page

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={filterType || '_all'} onValueChange={(v) => { setFilterType(v === '_all' ? '' : v as 'bank' | 'crypto'); setFilterBankId(''); setPage(1) }}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Tüm Tipler" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Tüm Tipler</SelectItem>
              <SelectItem value="bank">Banka</SelectItem>
              <SelectItem value="crypto">Kripto</SelectItem>
            </SelectContent>
          </Select>

          {filterType !== 'crypto' && banks.length > 0 && (
            <Select value={filterBankId || '_all'} onValueChange={(v) => { setFilterBankId(v === '_all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Tüm Bankalar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tüm Bankalar</SelectItem>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <span className="ml-auto text-xs text-muted-foreground font-mono">
            {meta?.total ?? 0} aktif hesap
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Aktif Hesap Min-Max Listesi</span>
          <span className="text-xs text-muted-foreground font-mono">{meta?.total ?? 0} kayıt</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : isError ? (
          <div className="py-16 text-center text-sm text-destructive">Hesap listesi yüklenemedi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Banka</th>
                  <th className="px-4 py-2">İsim</th>
                  <th className="px-4 py-2">IBAN</th>
                  <th className="px-4 py-2">Günlük Limit Kullanımı</th>
                  <th className="px-4 py-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      Aktif hesap bulunamadı.
                    </td>
                  </tr>
                ) : accounts.map((account) => (
                  <AccountRow key={account.id} account={account} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground font-mono">
            <span>{((currentPage - 1) * limit) + 1}–{Math.min(currentPage * limit, meta?.total ?? 0)} / {meta?.total ?? 0}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage(1)}>«</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>›</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
