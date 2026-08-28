'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarIcon, X, RefreshCw, Search } from 'lucide-react'
import { type DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useTransactions } from '@/features/transactions/use-transactions'
import { TransactionTable } from '@/features/transactions/TransactionTable'
import { TransactionDetail } from '@/features/transactions/TransactionDetail'
import { useMe } from '@/features/auth/use-me'
import { useBanks } from '@/features/banks/use-banks'
import { useMerchants } from '@/features/merchants/use-merchants'

const STATUS_OPTIONS = [
  { value: '',           label: 'Tüm Durumlar' },
  { value: 'PENDING',    label: 'Yeni' },
  { value: 'PROCESSING', label: 'İşlemde' },
  { value: 'APPROVED',   label: 'Onaylandı' },
  { value: 'COMPLETED',  label: 'Tamamlandı' },
  { value: 'REJECTED',   label: 'Reddedildi' },
  { value: 'FLAGGED',    label: 'Şüpheli' },
]

const LIMIT_OPTIONS = [
  { value: '25',  label: '25' },
  { value: '50',  label: '50' },
  { value: '100', label: '100' },
]

function DateRangePicker({ value, onChange }: {
  value: DateRange | undefined
  onChange: (r: DateRange | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const fmt = (d: Date) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const label = value?.from
    ? value.to ? `${fmt(value.from)} – ${fmt(value.to)}` : fmt(value.from)
    : 'Tarih aralığı'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted min-w-[160px]">
          <CalendarIcon className="size-3 text-muted-foreground shrink-0" />
          <span className={cn('truncate', !value?.from && 'text-muted-foreground')}>{label}</span>
          {value?.from && (
            <X
              className="size-3 text-muted-foreground hover:text-foreground shrink-0 ml-auto"
              onClick={(e) => { e.stopPropagation(); onChange(undefined) }}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="range" selected={value} onSelect={onChange} numberOfMonths={2} />
      </PopoverContent>
    </Popover>
  )
}

function StatCard({ label, value, sub, subColor }: {
  label: string
  value: string | number
  sub?: string
  subColor?: 'up' | 'down' | 'info'
}) {
  const colors = { up: 'text-green-500', down: 'text-red-400', info: 'text-blue-400' }
  return (
    <div className="rounded-lg border bg-card p-4 relative overflow-hidden group">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-purple-500 opacity-0 group-hover:opacity-60 transition-opacity" />
      <p className="text-[11px] text-muted-foreground font-mono mb-1.5 tracking-wide">{label}</p>
      <p className="text-2xl font-bold font-display">{value}</p>
      {sub && <p className={cn('text-[11px] mt-1', subColor ? colors[subColor] : 'text-muted-foreground')}>{sub}</p>}
    </div>
  )
}

export default function TransactionsPage() {
  const [page, setPage]             = useState(1)
  const [limit, setLimit]           = useState(25)
  const [status, setStatus]         = useState('PENDING')
  const [bankId, setBankId]         = useState('')
  const [merchantId, setMerchantId] = useState('')
  const [dateRange, setDateRange]   = useState<DateRange | undefined>(undefined)
  const [minAmount, setMinAmount]         = useState('')
  const [maxAmount, setMaxAmount]         = useState('')
  const [minAmountInput, setMinAmountInput] = useState('')
  const [maxAmountInput, setMaxAmountInput] = useState('')
  const [search, setSearch]               = useState('')
  const [searchType, setSearchType] = useState<'kullanici' | 'iban' | 'islem_id' | ''>('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null)
  const [activeTab, setActiveTab]   = useState<'deposit' | 'withdrawal'>('deposit')

  const router = useRouter()
  const { data: me } = useMe()
  const { data: banksData } = useBanks()
  const banks = banksData?.data ?? []
  const { data: merchantsData } = useMerchants(1, 100)
  const merchants = merchantsData?.data ?? []
  const userId   = me?.user.id       ?? ''
  const tenantId = me?.user.tenantId ?? ''

  useEffect(() => {
    if (me?.user.role === 'super_admin') router.replace('/system')
  }, [me, router])

  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const commonFilters = {
    bankId:      bankId || undefined,
    merchantId:  merchantId || undefined,
    dateFrom:    dateRange?.from ? dateRange.from.toISOString().split('T')[0] : undefined,
    dateTo:      dateRange?.to   ? dateRange.to.toISOString().split('T')[0]   : undefined,
    minAmount:   minAmount || undefined,
    maxAmount:   maxAmount || undefined,
    search:      search || undefined,
    searchType:  (search && searchType) ? searchType : undefined,
  }

  const { data, isLoading, error, refetch } = useTransactions(tenantId, userId, {
    ...commonFilters,
    status: status || undefined,
    type:   activeTab,
    page,
    limit,
  })

  // Stat counts — minimal queries
  const { data: pendingData }   = useTransactions(tenantId, userId, { type: activeTab, status: 'PENDING',    limit: 1 })
  const { data: processingData }= useTransactions(tenantId, userId, { type: activeTab, status: 'PROCESSING', limit: 1 })
  const { data: approvedData }  = useTransactions(tenantId, userId, { type: activeTab, status: 'APPROVED', dateFrom: today, dateTo: today, limit: 1 })

  const transactions = data?.data ?? []
  const meta         = data?.meta
  const totalPages   = meta ? Math.max(1, meta.totalPages) : 1

  function handleSearch() {
    setSearch(searchInput)
    setPage(1)
  }

  function resetFilters() {
    setStatus('PENDING')
    setBankId('')
    setMerchantId('')
    setDateRange(undefined)
    setMinAmount('')
    setMaxAmount('')
    setMinAmountInput('')
    setMaxAmountInput('')
    setSearch('')
    setSearchInput('')
    setSearchType('')
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label={activeTab === 'deposit' ? 'Bekleyen Yatırım' : 'Bekleyen Çekim'}
          value={(pendingData?.meta.total ?? 0).toLocaleString('tr-TR')}
          sub="PENDING durumunda"
          subColor="down"
        />
        <StatCard
          label="İşlemde"
          value={(processingData?.meta.total ?? 0).toLocaleString('tr-TR')}
          sub="aktif operatör kontrol"
          subColor="info"
        />
        <StatCard
          label="Onaylanan (bugün)"
          value={(approvedData?.meta.total ?? 0).toLocaleString('tr-TR')}
          sub="bugün onaylanan"
          subColor="up"
        />
        <StatCard
          label="Toplam (filtre)"
          value={(meta?.total ?? 0).toLocaleString('tr-TR')}
          sub="mevcut filtrede"
        />
      </div>

      {/* Filter Bar */}
      <div className="rounded-lg border bg-card p-3 space-y-2">
        {/* Row 1 */}
        <div className="flex flex-wrap gap-2 items-center">
          <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPage(1) }} />

          <Input
            type="number"
            placeholder="Min ₺"
            className="h-8 w-24 text-xs"
            value={minAmountInput}
            onChange={(e) => setMinAmountInput(e.target.value)}
            onBlur={() => { setMinAmount(minAmountInput); setPage(1) }}
            onKeyDown={(e) => e.key === 'Enter' && (setMinAmount(minAmountInput), setPage(1))}
          />
          <Input
            type="number"
            placeholder="Max ₺"
            className="h-8 w-24 text-xs"
            value={maxAmountInput}
            onChange={(e) => setMaxAmountInput(e.target.value)}
            onBlur={() => { setMaxAmount(maxAmountInput); setPage(1) }}
            onKeyDown={(e) => e.key === 'Enter' && (setMaxAmount(maxAmountInput), setPage(1))}
          />

          <Select value={status || '_all'} onValueChange={(v) => { setStatus(v === '_all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value || '_all'} value={o.value || '_all'}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={bankId || '_all'} onValueChange={(v) => { setBankId(v === '_all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Yöntem / Banka" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Tüm Bankalar</SelectItem>
              {banks.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={merchantId || '_all'} onValueChange={(v) => { setMerchantId(v === '_all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Tüm Siteler</SelectItem>
              {merchants.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.merchantName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2 */}
        <div className="flex flex-wrap gap-2 items-center">
          <Select
            value={searchType || '_none'}
            onValueChange={(v) => setSearchType(v === '_none' ? '' : v as typeof searchType)}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Arama tipi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Arama Tipi</SelectItem>
              <SelectItem value="kullanici">Kullanıcı Adı</SelectItem>
              <SelectItem value="iban">IBAN</SelectItem>
              <SelectItem value="islem_id">İşlem ID</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-1 flex-1 min-w-[200px]">
            <Input
              placeholder="Ara..."
              className="h-8 text-xs flex-1"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button size="sm" className="h-8 px-3" onClick={handleSearch}>
              <Search className="size-3" />
            </Button>
          </div>

          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => refetch()}>
            <RefreshCw className="size-3" />
            Yenile
          </Button>

          <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={resetFilters}>
            Sıfırla
          </Button>

          <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
            <SelectTrigger className="h-8 w-16 text-xs ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => { setActiveTab(v as 'deposit' | 'withdrawal'); setPage(1); setSelectedTxId(null) }}
      >
        <div className="flex items-center justify-between mb-2">
          <TabsList>
            <TabsTrigger value="deposit">
              Yatırım Havuzu
              {(pendingData?.meta.total ?? 0) > 0 && activeTab === 'deposit' && (
                <span className="ml-1.5 rounded-full bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0.5 font-mono">
                  {pendingData!.meta.total}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="withdrawal">
              Çekim Havuzu
              {(pendingData?.meta.total ?? 0) > 0 && activeTab === 'withdrawal' && (
                <span className="ml-1.5 rounded-full bg-red-500/20 text-red-400 text-[10px] px-1.5 py-0.5 font-mono">
                  {pendingData!.meta.total}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <span className="text-xs text-muted-foreground font-mono">
            {meta ? `${meta.total} kayıt` : ''}
          </span>
        </div>

        <TabsContent value={activeTab}>
          <div className="rounded-lg border bg-card overflow-hidden">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Yükleniyor...</div>
            ) : error ? (
              <div className="py-16 text-center text-sm text-destructive">İşlem listesi yüklenemedi.</div>
            ) : (
              <TransactionTable
                data={transactions}
                currentUserId={userId}
                userRole={me?.user.role ?? ''}
                selectedId={selectedTxId}
                onSelect={setSelectedTxId}
              />
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground font-mono">
                <span>
                  {meta && `${((page - 1) * limit) + 1}–${Math.min(page * limit, meta.total)} / ${meta.total}`}
                </span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                    return (
                      <Button
                        key={p}
                        variant={p === page ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 px-2 text-xs min-w-[28px]"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  })}
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      <Sheet open={!!selectedTxId} onOpenChange={(open) => { if (!open) setSelectedTxId(null) }}>
        <SheetContent side="right" className="overflow-y-auto w-[420px] sm:max-w-[420px]">
          <SheetTitle className="sr-only">İşlem Detayı</SheetTitle>
          <SheetDescription className="sr-only">Seçilen işlemin detay bilgileri</SheetDescription>
          {selectedTxId && (
            <div className="mt-4">
              <TransactionDetail
                transactionId={selectedTxId}
                currentUserId={userId}
                userRole={me?.user.role ?? ''}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
