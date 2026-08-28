'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { format } from 'date-fns'
import { ChevronsUpDown, Check } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DateRangePicker, type DateRange } from '@/components/ui/date-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { ReportSummaryCards } from '@/features/reports/ReportSummaryCards'
import {
  useTransactionReport,
  useMerchantDailyReport,
} from '@/features/reports/use-reports'
import { ExportSection } from '@/features/reports/ExportSection'
import { useMe } from '@/features/auth/use-me'
import { useTenants } from '@/features/tenants/use-tenants'

export default function ReportsPage() {
  const router = useRouter()
  const { data: me } = useMe()
  const isSuperAdmin = me?.user.role === 'super_admin'
  const canExport    = isSuperAdmin

  useEffect(() => {
    if (me && !isSuperAdmin) {
      router.replace('/transactions')
    }
  }, [me, isSuperAdmin, router])

  const [range, setRange] = useState<DateRange | undefined>()
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [tenantOpen, setTenantOpen] = useState(false)

  const { data: tenantsData } = useTenants(1, 100, { enabled: isSuperAdmin })
  const tenants = tenantsData?.data ?? []

  const from = range?.from ? format(range.from, 'yyyy-MM-dd') : undefined
  const to   = range?.to   ? format(range.to,   'yyyy-MM-dd') : undefined

  const merchantFilters = isSuperAdmin
    ? { from, to, tenantId: selectedTenantId || undefined }
    : { from, to }

  const { data: txData, isLoading: txLoading, error: txError } =
    useTransactionReport({ from, to })

  const { data: merchantData, isLoading: merchantLoading } =
    useMerchantDailyReport(merchantFilters)

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Raporlar</h1>

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker value={range} onChange={setRange} className="w-72" />

        {isSuperAdmin && tenants.length > 0 && (
          <Popover open={tenantOpen} onOpenChange={setTenantOpen}>
            <PopoverTrigger asChild>
              <button className="flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted w-52 justify-between">
                <span className="truncate">{selectedTenant ? selectedTenant.name : 'Tüm Tenant\'lar'}</span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Tenant ara..." className="h-8 text-xs" />
                <CommandList>
                  <CommandEmpty>Tenant bulunamadı.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem value="_all" onSelect={() => { setSelectedTenantId(''); setTenantOpen(false) }}>
                      <Check className={cn('mr-2 size-3', !selectedTenantId ? 'opacity-100' : 'opacity-0')} />
                      Tüm Tenant'lar
                    </CommandItem>
                    {tenants.map((t) => (
                      <CommandItem key={t.id} value={t.name} onSelect={() => { setSelectedTenantId(t.id); setTenantOpen(false) }}>
                        <Check className={cn('mr-2 size-3', selectedTenantId === t.id ? 'opacity-100' : 'opacity-0')} />
                        {t.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Merchant Günlük Ciro */}
      <Card>
        <CardHeader>
          <CardTitle>{selectedTenant ? `${selectedTenant.name} Günlük Ciro` : 'Günlük Ciro'}</CardTitle>
          <CardDescription>Tamamlanan işlemlere göre günlük site bazında ciro</CardDescription>
        </CardHeader>
        <CardContent>
          {merchantLoading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : !merchantData?.data?.length ? (
            <p className="text-sm text-muted-foreground">Veri bulunamadı.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Tarih</th>
                    <th className="pb-2 pr-4 font-medium">Site</th>
                    <th className="pb-2 pr-4 font-medium text-right">İşlem Adedi</th>
                    <th className="pb-2 font-medium text-right">Toplam Ciro (TRY)</th>
                  </tr>
                </thead>
                <tbody>
                  {merchantData.data.map((row, i) => (
                    <tr key={`${row.date}-${row.merchantId}`} className={`border-b last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/30'}`}>
                      <td className="py-2 pr-4 font-mono text-xs">{row.date}</td>
                      <td className="py-2 pr-4">{row.merchantName}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.count}</td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        {parseFloat(row.totalAmountTry).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="ml-1 text-xs text-muted-foreground">TRY</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* İşlem özet KPI'ları */}
      {txLoading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}
      {txError && <p className="text-sm text-destructive">Rapor yüklenemedi.</p>}
      {txData && <ReportSummaryCards data={txData.data} />}

      {/* Export bölümü (tenant_admin + super_admin) */}
      {canExport && <ExportSection />}

    </div>
  )
}
