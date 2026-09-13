'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useMe } from '@/features/auth/use-me'
import { useMerchants } from '@/features/merchants/use-merchants'
import { useCustomers } from '@/features/customers/use-customers'

export default function CustomersPage() {
  const { data: me } = useMe()
  const role = me?.user.role
  const isMerchant = role === 'merchant'

  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [merchantId, setMerchantId] = useState('')
  const [page, setPage] = useState(1)

  const { data: merchantsData } = useMerchants(1, 100, undefined, !isMerchant)
  const merchants = merchantsData?.data ?? []

  const { data, isLoading, error } = useCustomers({ search: q || undefined, merchantId: merchantId || undefined, page, limit: 20 })
  const rows = data?.data ?? []
  const meta = data?.meta

  const fullName = (f: string | null, l: string | null) => [f, l].filter(Boolean).join(' ') || '—'

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Müşteriler</h1>
        <p className="text-sm text-muted-foreground">Ödeme yapan son kullanıcıların isim, telefon ve kimlik bilgileri.</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search) }}
        >
          <Input
            placeholder="İsim, telefon, TC veya kullanıcı ID ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
          <Button type="submit" variant="outline" size="sm">Ara</Button>
        </form>
        {!isMerchant && (
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={merchantId}
            onChange={(e) => { setMerchantId(e.target.value); setPage(1) }}
          >
            <option value="">Tüm siteler</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.merchantName}</option>)}
          </select>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kayıtlı Kullanıcılar</CardTitle>
          <CardDescription>{meta ? `${meta.total} kayıt` : ''}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Yükleniyor...</p>
            : error ? <p className="text-sm text-destructive">Liste yüklenemedi.</p>
            : !rows.length ? <p className="text-sm text-muted-foreground">Kayıt bulunamadı.</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Ad Soyad</th>
                      <th className="px-3 py-2 font-medium">Telefon</th>
                      <th className="px-3 py-2 font-medium">TC Kimlik</th>
                      {!isMerchant && <th className="px-3 py-2 font-medium">Site</th>}
                      <th className="px-3 py-2 font-medium">Kullanıcı ID</th>
                      <th className="px-3 py-2 text-right font-medium">Yatırım</th>
                      <th className="px-3 py-2 font-medium">Son İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{fullName(c.firstName, c.lastName)}</td>
                        <td className="px-3 py-2 tabular-nums">{c.phone ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">{c.identityNumber ?? '—'}</td>
                        {!isMerchant && <td className="px-3 py-2">{c.merchantName}</td>}
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.externalUserId}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.depositCount}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{format(new Date(c.lastSeenAt), 'yyyy-MM-dd HH:mm')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sayfa {meta.page} / {meta.totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Önceki</Button>
                <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Sonraki</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
