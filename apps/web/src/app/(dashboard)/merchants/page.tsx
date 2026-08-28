'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ApiError } from '@/lib/api-client'
import { useMerchants, useCreateMerchant, useDeleteMerchant } from '@/features/merchants/use-merchants'
import { useTenants } from '@/features/tenants/use-tenants'
import { useMe } from '@/features/auth/use-auth'
import type { Merchant, CreateMerchantInput } from '@panel/types'

function CreateMerchantDialog({
  open, onClose, onConfirm, isPending, error, isSuperAdmin,
}: {
  open: boolean; onClose: () => void
  onConfirm: (data: CreateMerchantInput) => void
  isPending: boolean; error: string | null; isSuperAdmin: boolean
}) {
  const [merchantName, setMerchantName] = useState('')
  const [webhookUrl, setWebhookUrl]     = useState('https://gateway.pingiz.cloud/webhook')
  const [isSandbox, setIsSandbox]       = useState(true)
  const [tenantId, setTenantId]         = useState('')
  const { data: tenantsData } = useTenants(1, 100, { enabled: isSuperAdmin })
  const tenantList = tenantsData?.data ?? []

  const isValid = merchantName.trim().length >= 2 && webhookUrl.trim().length > 0 && (!isSuperAdmin || tenantId !== '')

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Yeni Site Oluştur</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {isSuperAdmin && (
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tenant *</label>
              <Select value={tenantId || '_none'} onValueChange={(v) => setTenantId(v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Tenant seçin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Tenant seçin</SelectItem>
                  {tenantList.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Site Adı *</label>
            <Input value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Site adı" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Webhook URL *</label>
            <Input type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="isSandbox" checked={isSandbox} onCheckedChange={(v) => setIsSandbox(!!v)} />
            <label htmlFor="isSandbox" className="text-sm">Sandbox modu</label>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>İptal</Button>
          <Button onClick={() => onConfirm({ merchantName, webhookUrl, isSandbox, ...(isSuperAdmin && tenantId ? { tenantId } : {}) })} disabled={isPending || !isValid}>
            {isPending ? 'Oluşturuluyor...' : 'Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MerchantRow({ merchant, showTenant }: { merchant: Merchant; showTenant?: boolean }) {
  const [confirm, setConfirm] = useState(false)
  const deleteMerchant = useDeleteMerchant(merchant.id)

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-2 font-mono text-muted-foreground text-[11px]">{merchant.id.slice(0, 8)}</td>
      <td className="px-4 py-2 font-medium">
        <Link href={`/merchants/${merchant.id}`} className="hover:text-primary transition-colors">
          <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            {merchant.merchantName}
          </span>
        </Link>
      </td>
      {showTenant && (
        <td className="px-4 py-2 text-xs text-muted-foreground">{merchant.tenantName ?? '—'}</td>
      )}
      <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground max-w-[200px] truncate" title={merchant.webhookUrl}>
        {merchant.webhookUrl}
      </td>
      <td className="px-4 py-2">
        {merchant.isSandbox && (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            Sandbox
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono border ${
          merchant.status === 'active'
            ? 'bg-green-500/10 text-green-400 border-green-500/20'
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          {merchant.status === 'active' ? 'Aktif' : 'Pasif'}
        </span>
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" asChild>
            <Link href={`/merchants/${merchant.id}`}>Düzenle</Link>
          </Button>
          {confirm ? (
            <>
              <Button size="sm" variant="destructive" className="h-6 px-2 text-[10px]" disabled={deleteMerchant.isPending} onClick={() => deleteMerchant.mutate()}>
                Onayla
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setConfirm(false)}>İptal</Button>
            </>
          ) : (
            <Button size="sm" variant="destructive" className="h-6 px-2 text-[10px]" onClick={() => setConfirm(true)}>Sil</Button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default function MerchantsPage() {
  const [page, setPage]                 = useState(1)
  const [filterTenantId, setFilterTenantId] = useState('')
  const [dialogOpen, setDialogOpen]     = useState(false)
  const [createError, setCreateError]   = useState<string | null>(null)
  const limit = 25

  const { data: meData } = useMe()
  const actorRole   = meData?.user?.role
  const isSuperAdmin = actorRole === 'super_admin'

  const { data, isLoading, error } = useMerchants(page, limit, filterTenantId || undefined)
  const { data: tenantsData }      = useTenants(1, 100, { enabled: isSuperAdmin })
  const createMerchant             = useCreateMerchant()

  const merchantList = data?.data ?? []
  const meta         = data?.meta
  const totalPages   = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1
  const currentPage  = meta?.page ?? page
  const tenantList   = tenantsData?.data ?? []

  async function handleCreate(input: CreateMerchantInput) {
    setCreateError(null)
    try {
      await createMerchant.mutateAsync(input)
      setDialogOpen(false)
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Site oluşturulamadı.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-2 items-center">
          {isSuperAdmin && tenantList.length > 0 && (
            <Select value={filterTenantId || '_all'} onValueChange={(v) => { setFilterTenantId(v === '_all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Tüm Tenantlar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tüm Tenantlar</SelectItem>
                {tenantList.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <span className="ml-auto text-xs text-muted-foreground font-mono">{meta?.total ?? 0} site</span>
          {(actorRole === 'super_admin' || actorRole === 'tenant_admin') && (
            <Button size="sm" className="h-8 text-xs" onClick={() => { setCreateError(null); setDialogOpen(true) }}>
              + Yeni Site
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Siteler</span>
          <span className="text-xs text-muted-foreground font-mono">{meta?.total ?? 0} kayıt</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">Site listesi yüklenemedi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Site Adı</th>
                  {isSuperAdmin && <th className="px-4 py-2">Tenant</th>}
                  <th className="px-4 py-2">Callback URL</th>
                  <th className="px-4 py-2">Ortam</th>
                  <th className="px-4 py-2">Durum</th>
                  <th className="px-4 py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {merchantList.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 7 : 6} className="py-12 text-center text-muted-foreground">
                      Henüz site oluşturulmamış.
                    </td>
                  </tr>
                ) : merchantList.map((merchant) => (
                  <MerchantRow key={merchant.id} merchant={merchant} showTenant={isSuperAdmin} />
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
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        )}
      </div>

      <CreateMerchantDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleCreate}
        isPending={createMerchant.isPending}
        error={createError}
        isSuperAdmin={actorRole === 'super_admin'}
      />
    </div>
  )
}
