'use client'

import { useState, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Check, ChevronsUpDown, Landmark, Coins, Copy, CopyCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { ApiError } from '@/lib/api-client'
import {
  usePaymentAccounts,
  useCreatePaymentAccount,
  useUpdatePaymentAccount,
  useUpdatePaymentAccountStatus,
  useUpdateDailyLimit,
} from '@/features/payment-accounts/use-payment-accounts'
import { useBanks }   from '@/features/banks/use-banks'
import { useCryptos } from '@/features/cryptos/use-cryptos'
import type { PaymentAccount } from '@panel/types'

// --- Helpers ---

function calcFillPercent(used: string, limit: string): number {
  const u = parseFloat(used)
  const l = parseFloat(limit)
  if (l <= 0) return 0
  return Math.min(100, Math.round((u / l) * 100))
}

function typeBadgeLabel(type: string) {
  if (type === 'bank')   return 'Banka'
  if (type === 'crypto') return 'Kripto'
  return type
}

// --- Progress Bar ---

function FillBar({ percent }: { percent: number }) {
  const color =
    percent >= 90 ? 'bg-destructive' :
    percent >= 70 ? 'bg-yellow-500' :
    'bg-primary'

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full transition-all ${color}`} style={{ width: `${percent}%` }} />
    </div>
  )
}

// --- Account Form Dialog ---

type AccountType = 'bank' | 'crypto'

type AccountFormData = {
  type:          AccountType
  bankId:        string
  cryptoIds:     string[]
  name:          string
  accountNumber: string
  environment:   'sandbox' | 'production'
  dailyLimit:    string
}

function AccountFormDialog({
  open,
  onClose,
  onConfirm,
  isPending,
  error,
  initialData,
  title,
}: {
  open:        boolean
  onClose:     () => void
  onConfirm:   (data: AccountFormData) => void
  isPending:   boolean
  error:       string | null
  initialData?: Partial<AccountFormData>
  title:       string
}) {
  const { data: banksData }   = useBanks()
  const { data: cryptosData } = useCryptos()

  const banks   = (banksData?.data ?? []).filter((b) => b.isActive)
  const cryptos = (cryptosData?.data ?? []).filter((c) => c.isActive)

  const [form, setForm] = useState<AccountFormData>({
    type:          'bank',
    bankId:        '',
    cryptoIds:     [],
    name:          '',
    accountNumber: '',
    environment:   'production',
    dailyLimit:    '',
  })

  useEffect(() => {
    if (open) {
      setForm({
        type:          initialData?.type          ?? 'bank',
        bankId:        initialData?.bankId        ?? '',
        cryptoIds:     initialData?.cryptoIds     ?? [],
        name:          initialData?.name          ?? '',
        accountNumber: initialData?.accountNumber ?? '',
        environment:   initialData?.environment   ?? 'production',
        dailyLimit:    initialData?.dailyLimit     ?? '',
      })
    }
  }, [open])

  function toggleCrypto(id: string) {
    setForm((f) => ({
      ...f,
      cryptoIds: f.cryptoIds.includes(id)
        ? f.cryptoIds.filter((c) => c !== id)
        : [...f.cryptoIds, id],
    }))
  }

  const selectedBank = banks.find((b) => b.id === form.bankId)

  // IBAN banka kodu kontrolü: TR(2) + kontrol(2) + bankKodu(5) = index 4-8
  const ibanBankCode = form.accountNumber.length >= 9
    ? form.accountNumber.slice(4, 9)
    : null

  const ibanBankMismatch =
    form.type === 'bank' &&
    form.bankId.length > 0 &&
    selectedBank?.ibanCode != null &&
    ibanBankCode !== null &&
    ibanBankCode !== selectedBank.ibanCode

  const isValid =
    form.name.trim().length >= 2 &&
    form.accountNumber.trim().length >= 4 &&
    /^\d+(\.\d{1,2})?$/.test(form.dailyLimit) &&
    (form.type === 'bank'   ? form.bankId.length > 0 : true) &&
    (form.type === 'crypto' ? form.cryptoIds.length > 0 : true) &&
    !ibanBankMismatch

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">

          <div className="space-y-1">
            <label className="text-sm font-medium">Hesap Tipi *</label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((f) => ({ ...f, type: v as AccountType, bankId: '', cryptoIds: [] }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Banka Hesabı</SelectItem>
                <SelectItem value="crypto">Kripto Hesabı</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.type === 'bank' && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Banka *</label>
              <Select
                value={form.bankId || '_none'}
                onValueChange={(v) => setForm((f) => ({ ...f, bankId: v === '_none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="— Banka seçin —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— Banka seçin —</SelectItem>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.type === 'crypto' && (
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Kripto Paralar * <span className="text-xs text-muted-foreground">(birden fazla seçilebilir)</span>
              </label>
              <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                {cryptos.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-muted">
                    <Checkbox
                      checked={form.cryptoIds.includes(c.id)}
                      onCheckedChange={() => toggleCrypto(c.id)}
                    />
                    <span className="text-sm">{c.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{c.symbol}</span>
                  </label>
                ))}
              </div>
              {form.cryptoIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{form.cryptoIds.length} kripto seçildi</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Hesap Adı *</label>
            <Input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Örn: IBAN-TRY-1"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              {form.type === 'crypto' ? 'Cüzdan Adresi *' : 'IBAN / Hesap No *'}
            </label>
            <Input
              type="text"
              value={form.accountNumber}
              onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
              placeholder={form.type === 'crypto' ? '0x...' : 'TR33000610...'}
              className={ibanBankMismatch ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {ibanBankMismatch && (
              <p className="text-xs text-destructive">
                Bu IBAN seçilen bankaya ait değil (banka kodu: {ibanBankCode}, beklenen: {selectedBank?.ibanCode})
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Ortam *</label>
            <Select
              value={form.environment}
              onValueChange={(v) => setForm((f) => ({ ...f, environment: v as 'sandbox' | 'production' }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="sandbox">Sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Günlük Limit *</label>
            <Input
              type="text"
              value={form.dailyLimit}
              onChange={(e) => setForm((f) => ({ ...f, dailyLimit: e.target.value }))}
              placeholder="50000.00"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            İptal
          </Button>
          <Button onClick={() => onConfirm(form)} disabled={isPending || !isValid}>
            {isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Daily Limit Dialog ---

function DailyLimitDialog({
  accountId,
  open,
  onClose,
}: {
  accountId: string
  open:      boolean
  onClose:   () => void
}) {
  const [limit, setLimit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const update = useUpdateDailyLimit(accountId)

  useEffect(() => {
    if (!open) { setLimit(''); setError(null) }
  }, [open])

  const isValid = /^\d+(\.\d{1,2})?$/.test(limit)

  async function handleSave() {
    setError(null)
    try {
      await update.mutateAsync({ dailyLimit: limit })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Limit güncellenemedi.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Günlük Limit Güncelle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Yeni Günlük Limit *</label>
            <Input
              type="text"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="50000.00"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>İptal</Button>
          <Button onClick={handleSave} disabled={update.isPending || !isValid}>
            {update.isPending ? 'Güncelleniyor...' : 'Güncelle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Actions Cell ---

function ActionsCell({
  account,
  onEdit,
}: {
  account: PaymentAccount
  onEdit:  (a: PaymentAccount) => void
}) {
  const [limitOpen, setLimitOpen]     = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const updateStatus = useUpdatePaymentAccountStatus(account.id)

  async function handleToggleStatus() {
    setStatusError(null)
    try {
      await updateStatus.mutateAsync({
        status: account.status === 'active' ? 'inactive' : 'active',
      })
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Durum güncellenemedi.')
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => onEdit(account)}>
          Düzenle
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setLimitOpen(true)}>
          Limit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleStatus}
          disabled={updateStatus.isPending}
        >
          {account.status === 'active' ? 'Pasif Yap' : 'Aktif Yap'}
        </Button>
      </div>
      {statusError && <p className="text-xs text-destructive text-right">{statusError}</p>}
      <DailyLimitDialog
        accountId={account.id}
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
      />
    </>
  )
}

// --- Copyable Address ---

function CopyableAddress({ address, hideText }: { address: string; hideText?: boolean }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(address)
    } else {
      const el = document.createElement('textarea')
      el.value = address
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-1 group">
      {!hideText && <span className="text-xs text-muted-foreground font-mono">{address}</span>}
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
      >
        {copied ? <CopyCheck className="size-3" /> : <Copy className="size-3" />}
      </button>
    </div>
  )
}

// --- Columns ---

function buildColumns(
  onEdit: (a: PaymentAccount) => void,
): ColumnDef<PaymentAccount>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Hesap Adı',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 group">
          <span className="font-medium">{row.original.name}</span>
          <CopyableAddress address={row.original.name} hideText />
        </div>
      ),
    },
    {
      accessorKey: 'accountNumber',
      header: 'IBAN / Adres',
      cell: ({ row }) => <CopyableAddress address={row.original.accountNumber} />,
    },
    {
      id: 'accountType',
      header: 'Hesap Tipi',
      cell: ({ row }) => {
        const type = row.original.type
        return (
          <div className="flex items-center gap-1.5 text-sm">
            {type === 'bank'
              ? <Landmark className="size-3.5 shrink-0 text-muted-foreground" />
              : <Coins className="size-3.5 shrink-0 text-muted-foreground" />}
            {typeBadgeLabel(type)}
          </div>
        )
      },
    },
    {
      id: 'bank',
      header: 'Banka / Kripto',
      cell: ({ row }) => {
        const a = row.original
        if (a.bank) return <span className="text-sm">{a.bank.name}</span>
        if (a.cryptos.length > 0) return <span className="text-sm">{a.cryptos.map((c) => c.symbol).join(', ')}</span>
        return <span className="text-muted-foreground text-xs">—</span>
      },
    },
    {
      accessorKey: 'environment',
      header: 'Ortam',
      cell: ({ row }) => (
        <Badge variant={row.original.environment === 'production' ? 'default' : 'secondary'}>
          {row.original.environment === 'production' ? 'Production' : 'Sandbox'}
        </Badge>
      ),
    },
    {
      id: 'dailyLimit',
      header: 'Günlük Limit',
      cell: ({ row }) => {
        const a = row.original
        const percent = calcFillPercent(a.dailyUsed, a.dailyLimit)
        return (
          <div className="min-w-32 space-y-1">
            <p className="text-xs text-muted-foreground">{a.dailyUsed} / {a.dailyLimit}</p>
            <FillBar percent={percent} />
          </div>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Durum',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'active' ? 'default' : 'outline'}>
          {row.original.status === 'active' ? 'Aktif' : 'Pasif'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => <ActionsCell account={row.original} onEdit={onEdit} />,
    },
  ]
}

// --- Bank Combobox ---

function BankCombobox({
  banks,
  value,
  onChange,
}: {
  banks: { id: string; name: string }[]
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = banks.find((b) => b.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted w-36 justify-between">
          <span className="truncate">{selected ? selected.name : 'Tümü'}</span>
          <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <Command>
          <CommandInput placeholder="Banka ara..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>Banka bulunamadı.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="_all" onSelect={() => { onChange(''); setOpen(false) }}>
                <Check className={cn('mr-2 size-3', !value ? 'opacity-100' : 'opacity-0')} />
                Tümü
              </CommandItem>
              {banks.map((b) => (
                <CommandItem key={b.id} value={b.name} onSelect={() => { onChange(b.id); setOpen(false) }}>
                  <Check className={cn('mr-2 size-3', value === b.id ? 'opacity-100' : 'opacity-0')} />
                  {b.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// --- Main Page ---

export default function PaymentAccountsPage() {
  const [page, setPage]               = useState(1)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType]   = useState('')
  const [filterBankId, setFilterBankId] = useState('')
  const [createOpen, setCreateOpen]   = useState(false)
  const [editAccount, setEditAccount] = useState<PaymentAccount | null>(null)
  const [formError, setFormError]     = useState<string | null>(null)

  const { data: banksData } = useBanks()
  const banks = banksData?.data ?? []

  const limit = 20
  const filters = {
    status: filterStatus || undefined,
    type:   filterType   || undefined,
    bankId: filterBankId || undefined,
  }

  const { data, isLoading, error } = usePaymentAccounts(filters, page, limit)
  const createAccount              = useCreatePaymentAccount()
  const updateAccount              = useUpdatePaymentAccount(editAccount?.id ?? '')

  const accounts   = data?.data ?? []
  const meta       = data?.meta
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1
  const currentPage = meta?.page ?? page

  function handleEditOpen(a: PaymentAccount) {
    setFormError(null)
    setEditAccount(a)
  }

  const columns = buildColumns(handleEditOpen)

  const table = useReactTable({
    data: accounts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  async function handleCreate(input: AccountFormData) {
    setFormError(null)
    try {
      const payload =
        input.type === 'bank'
          ? { type: input.type, bankId: input.bankId, name: input.name, accountNumber: input.accountNumber, environment: input.environment, dailyLimit: input.dailyLimit }
          : { type: input.type, cryptoIds: input.cryptoIds, name: input.name, accountNumber: input.accountNumber, environment: input.environment, dailyLimit: input.dailyLimit }
      await createAccount.mutateAsync(payload)
      setCreateOpen(false)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Hesap oluşturulamadı.')
    }
  }

  async function handleUpdate(input: AccountFormData) {
    if (!editAccount) return
    setFormError(null)
    try {
      await updateAccount.mutateAsync({
        name:          input.name,
        accountNumber: input.accountNumber,
        environment:   input.environment,
        dailyLimit:    input.dailyLimit,
        ...(input.type === 'bank'   && input.bankId      && { bankId: input.bankId }),
        ...(input.type === 'crypto' && input.cryptoIds.length > 0 && { cryptoIds: input.cryptoIds }),
      })
      setEditAccount(null)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Hesap güncellenemedi.')
    }
  }

  function getEditInitialData(a: PaymentAccount): Partial<AccountFormData> {
    return {
      type:          a.type,
      bankId:        a.bankId ?? '',
      cryptoIds:     a.cryptos.map((c) => c.id),
      name:          a.name,
      accountNumber: a.accountNumber,
      environment:   a.environment,
      dailyLimit:    a.dailyLimit,
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hesap Yönetimi</h1>
        <Button onClick={() => { setFormError(null); setCreateOpen(true) }}>
          Yeni Hesap
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-6">
        {/* Durum */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Durum</span>
          <div className="flex rounded-md border overflow-hidden">
            {([['', 'Tümü'], ['active', 'Aktif'], ['inactive', 'Pasif']] as const).map(([val, label], i) => (
              <button
                key={val}
                onClick={() => { setFilterStatus(val); setPage(1) }}
                className={[
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  i > 0 ? 'border-l' : '',
                  filterStatus === val
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted text-foreground',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Hesap Tipi */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Tip</span>
          <div className="flex rounded-md border overflow-hidden">
            {([['', 'Tümü'], ['bank', 'Banka'], ['crypto', 'Kripto']] as const).map(([val, label], i) => (
              <button
                key={val}
                onClick={() => { setFilterType(val); if (val === 'crypto') setFilterBankId(''); setPage(1) }}
                className={[
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  i > 0 ? 'border-l' : '',
                  filterType === val
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted text-foreground',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Banka */}
        {banks.length > 0 && filterType !== 'crypto' && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Banka</span>
            <BankCombobox
              banks={banks}
              value={filterBankId}
              onChange={(v) => { setFilterBankId(v); setPage(1) }}
            />
          </div>
        )}

        {/* Sıfırla */}
        {(filterStatus || filterType || filterBankId) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterType(''); setFilterBankId(''); setPage(1) }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Filtreleri temizle
          </button>
        )}

        <p className="ml-auto text-xs text-muted-foreground">
          {meta ? `${meta.total} hesap` : ''}
        </p>
      </div>

      <div>
        <div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : error ? (
            <p className="text-sm text-destructive">Hesap listesi yüklenemedi.</p>
          ) : (
            <>
              <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="bg-muted/50">
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                        Ödeme hesabı bulunamadı.
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Önceki
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Sayfa {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Sonraki
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AccountFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        isPending={createAccount.isPending}
        error={formError}
        title="Yeni Ödeme Hesabı"
      />

      <AccountFormDialog
        open={!!editAccount}
        onClose={() => setEditAccount(null)}
        onConfirm={handleUpdate}
        isPending={updateAccount.isPending}
        error={formError}
        initialData={editAccount ? getEditInitialData(editAccount) : undefined}
        title="Hesabı Düzenle"
      />
    </div>
  )
}
