'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCallbackList, useCallbackStatusSummary } from '@/features/callbacks/use-callbacks'
import { useMe } from '@/features/auth/use-me'
import { useMerchants } from '@/features/merchants/use-merchants'
import type { GlobalCallbackItem } from '@panel/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' })
}

const SUMMARY_STATS = [
  {
    key: 'pending' as const,
    label: 'Bekleyen',
    sublabel: 'pending',
    desc: 'Job kuyruğa alındı, henüz işlenmedi',
    color: (v: number) => v > 0 ? 'text-yellow-600' : '',
  },
  {
    key: 'sent' as const,
    label: 'Gönderildi',
    sublabel: 'sent',
    desc: 'Webhook başarıyla teslim edildi',
    color: () => 'text-green-600',
  },
  {
    key: 'failed' as const,
    label: 'Başarısız',
    sublabel: 'failed',
    desc: 'Tüm denemeler tükendi veya config eksik',
    color: (v: number) => v > 0 ? 'text-orange-600' : '',
  },
  {
    key: 'dead' as const,
    label: 'Ölü',
    sublabel: 'dead',
    desc: 'Manuel müdahale gerekiyor',
    color: (v: number) => v > 0 ? 'text-red-600' : '',
  },
]

function CallbackRow({ cb, isSuperAdmin }: { cb: GlobalCallbackItem; isSuperAdmin: boolean }) {
  return (
    <TableRow>
      {isSuperAdmin && (
        <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground" title={cb.merchantName ?? cb.merchantId ?? ''}>
          {cb.merchantName ?? '—'}
        </TableCell>
      )}
      <TableCell>
        <Link
          href={`/transactions/${cb.transactionId}`}
          className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {cb.transactionId.slice(0, 8)}…
        </Link>
        {cb.txStatus && (
          <span className="ml-1.5 text-xs text-muted-foreground">{cb.txStatus}</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatDate(cb.sentAt)}</TableCell>
      <TableCell className="text-center font-mono text-xs">{cb.attemptNumber}</TableCell>
      <TableCell className="text-center text-xs">
        {cb.responseStatus != null ? (
          <span className={cb.responseStatus >= 200 && cb.responseStatus < 300 ? 'text-green-600' : 'text-red-600'}>
            {cb.responseStatus}
          </span>
        ) : cb.errorMessage ? (
          <span className="text-red-600">{cb.errorMessage}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {cb.success ? (
          <Badge className="bg-green-600 text-white text-xs hover:bg-green-600">Başarılı</Badge>
        ) : (
          <Badge variant="destructive" className="w-fit text-xs">Başarısız</Badge>
        )}
      </TableCell>
    </TableRow>
  )
}

export default function CallbacksPage() {
  const { data: meData } = useMe()
  const role = meData?.user?.role
  const isSuperAdmin = role === 'super_admin'

  const { data: summary } = useCallbackStatusSummary()
  const { data: merchantsData } = useMerchants(1, 100)
  const merchantList = merchantsData?.data ?? []

  const [page, setPage] = useState(1)

  const [successDraft, setSuccessDraft]       = useState<'all' | 'true' | 'false'>('all')
  const [fromDraft, setFromDraft]             = useState<Date | undefined>(undefined)
  const [toDraft, setToDraft]                 = useState<Date | undefined>(undefined)
  const [txIdDraft, setTxIdDraft]             = useState('')
  const [merchantIdDraft, setMerchantIdDraft] = useState('')
  const [merchantOpen, setMerchantOpen]       = useState(false)

  const [successApplied, setSuccessApplied]       = useState<'all' | 'true' | 'false'>('all')
  const [fromApplied, setFromApplied]             = useState<Date | undefined>(undefined)
  const [toApplied, setToApplied]                 = useState<Date | undefined>(undefined)
  const [txIdApplied, setTxIdApplied]             = useState('')
  const [merchantIdApplied, setMerchantIdApplied] = useState('')

  const fromISO = fromApplied ? fromApplied.toISOString() : undefined
  const toISO   = toApplied   ? new Date(toApplied.getFullYear(), toApplied.getMonth(), toApplied.getDate(), 23, 59, 59, 999).toISOString() : undefined

  const { data, isLoading, error } = useCallbackList({
    page,
    success:       successApplied === 'all' ? undefined : successApplied === 'true',
    from:          fromISO,
    to:            toISO,
    transactionId: txIdApplied || undefined,
    merchantId:    isSuperAdmin ? (merchantIdApplied || undefined) : undefined,
  })

  const rows       = data?.data ?? []
  const meta       = data?.meta
  const totalPages = meta ? Math.max(1, meta.totalPages) : 1

  if (role && role !== 'super_admin' && role !== 'tenant_admin') {
    return <p className="p-6 text-sm text-muted-foreground">Bu sayfaya erişim yetkiniz yok.</p>
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault()
    setSuccessApplied(successDraft)
    setFromApplied(fromDraft)
    setToApplied(toDraft)
    setTxIdApplied(txIdDraft)
    setMerchantIdApplied(merchantIdDraft)
    setPage(1)
  }

  function clearFilters() {
    setSuccessDraft('all'); setFromDraft(undefined); setToDraft(undefined); setTxIdDraft(''); setMerchantIdDraft('')
    setSuccessApplied('all'); setFromApplied(undefined); setToApplied(undefined); setTxIdApplied(''); setMerchantIdApplied('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/system" className="text-sm text-muted-foreground hover:text-foreground">← Sistem</Link>
        <h1 className="text-2xl font-bold">Callback Logları</h1>
      </div>

      {/* Durum Özeti */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUMMARY_STATS.map(({ key, label, sublabel, desc, color }) => (
            <Card key={key}>
              <CardHeader className="pb-1">
                <CardDescription>
                  {label} <span className="font-mono">({sublabel})</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold tabular-nums ${color(summary[key])}`}>
                  {summary[key]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {summary && summary.pending === 0 && summary.sent === 0 && summary.failed === 0 && summary.dead === 0 && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-4">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
              Hiç callback tetiklenmemiş
            </p>
            <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-500">
              Henüz onaylanmış/reddedilmiş işlem yok ya da pg-boss worker çalışmıyor.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filtreler */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtreler</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={applyFilters} className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs">Sonuç</Label>
              <Select value={successDraft} onValueChange={(v) => setSuccessDraft(v as 'all' | 'true' | 'false')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="true">Başarılı</SelectItem>
                  <SelectItem value="false">Başarısız</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Başlangıç</Label>
              <DatePicker value={fromDraft} onChange={setFromDraft} placeholder="Başlangıç tarihi" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bitiş</Label>
              <DatePicker value={toDraft} onChange={setToDraft} placeholder="Bitiş tarihi" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Transaction ID</Label>
              <Input placeholder="UUID" value={txIdDraft} onChange={e => setTxIdDraft(e.target.value)} className="font-mono" />
            </div>
            {isSuperAdmin && (
              <div className="space-y-1.5">
                <Label className="text-xs">Merchant</Label>
                <Popover open={merchantOpen} onOpenChange={setMerchantOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={merchantOpen} className="w-full justify-between font-normal">
                      {merchantIdDraft
                        ? (merchantList.find(m => m.id === merchantIdDraft)?.merchantName ?? 'Merchant')
                        : 'Tümü'}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-0">
                    <Command>
                      <CommandInput placeholder="Merchant ara..." />
                      <CommandList>
                        <CommandEmpty>Bulunamadı.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem value="all" onSelect={() => { setMerchantIdDraft(''); setMerchantOpen(false) }}>
                            <Check className={cn('mr-2 size-4', !merchantIdDraft ? 'opacity-100' : 'opacity-0')} />
                            Tümü
                          </CommandItem>
                          {merchantList.map(m => (
                            <CommandItem key={m.id} value={m.merchantName} onSelect={() => { setMerchantIdDraft(m.id); setMerchantOpen(false) }}>
                              <Check className={cn('mr-2 size-4', merchantIdDraft === m.id ? 'opacity-100' : 'opacity-0')} />
                              {m.merchantName}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Button type="submit" size="sm">Filtrele</Button>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Temizle</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Tablo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log Kayıtları</CardTitle>
          <CardDescription>
            {meta ? `Toplam ${meta.total} kayıt` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">Callback logları yüklenemedi.</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Kayıt bulunamadı.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {isSuperAdmin && <TableHead>Merchant</TableHead>}
                    <TableHead>Transaction</TableHead>
                    <TableHead>Gönderim Tarihi</TableHead>
                    <TableHead className="text-center">Deneme</TableHead>
                    <TableHead className="text-center">HTTP</TableHead>
                    <TableHead>Sonuç</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(cb => (
                    <CallbackRow key={cb.id} cb={cb} isSuperAdmin={isSuperAdmin} />
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between p-4">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      Önceki
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Sayfa {meta?.page ?? page} / {totalPages}
                    </span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      Sonraki
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
