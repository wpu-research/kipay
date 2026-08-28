'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api-client'
import { useTenants, useCreateTenant, useUpdateTenantStatus, useDeleteTenant } from '@/features/tenants/use-tenants'
import { CreateTenantSchema } from '@panel/types'
import type { Tenant } from '@panel/types'

function CreateTenantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createTenant = useCreateTenant()
  const [name, setName]             = useState('')
  const [slug, setSlug]             = useState('')
  const [slugWarning, setSlugWarning] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setName(''); setSlug(''); setSlugWarning(null); setError(null) }
  }, [open])

  function handleNameChange(value: string) {
    setName(value)
    const generated = value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').slice(0, 64).replace(/^-+|-+$/g, '')
    setSlug(generated)
    setSlugWarning(value.length > 0 && generated.length === 0 ? 'Bu isimden geçerli bir kimlik üretilemedi.' : null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const validation = CreateTenantSchema.safeParse({ name, slug })
    if (!validation.success) { setError(validation.error.errors[0]?.message ?? 'Geçersiz değerler.'); return }
    try {
      await createTenant.mutateAsync({ name, slug })
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === 'TENANT_SLUG_CONFLICT' ? 'Bu isim zaten kullanımda.' : err.message)
      } else {
        setError('Tenant oluşturulamadı.')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Yeni Tenant Oluştur</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tenant-name">Tenant Adı</Label>
              <Input id="tenant-name" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Örn: Acme Ltd." minLength={2} maxLength={128} required />
              {slugWarning && <p className="text-xs text-amber-600">{slugWarning}</p>}
            </div>
            {slug && <p className="text-xs text-muted-foreground">Kimlik (slug): <code>{slug}</code></p>}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={createTenant.isPending}>İptal</Button>
            <Button type="submit" disabled={createTenant.isPending || !name.trim()}>
              {createTenant.isPending ? 'Oluşturuluyor...' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TenantRow({ tenant }: { tenant: Tenant }) {
  const [error, setError]           = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const updateStatus = useUpdateTenantStatus(tenant.id)
  const deleteTenant = useDeleteTenant()

  async function handleToggleStatus() {
    if (updateStatus.isPending) return
    setError(null)
    try {
      await updateStatus.mutateAsync(tenant.status === 'active' ? 'inactive' : 'active')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Durum güncellenemedi.')
    }
  }

  async function handleDelete() {
    setError(null)
    try {
      await deleteTenant.mutateAsync(tenant.id)
    } catch (err) {
      setConfirmDelete(false)
      setError(err instanceof ApiError ? err.message : 'Tenant silinemedi.')
    }
  }

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-2 font-mono text-muted-foreground text-[11px]">{tenant.id.slice(0, 8)}</td>
      <td className="px-4 py-2 font-medium">{tenant.name}</td>
      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{tenant.slug}</td>
      <td className="px-4 py-2">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono border ${
          tenant.status === 'active'
            ? 'bg-green-500/10 text-green-400 border-green-500/20'
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          {tenant.status === 'active' ? 'Aktif' : 'Pasif'}
        </span>
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
        {new Date(tenant.createdAt).toLocaleDateString('tr-TR')}
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={updateStatus.isPending} onClick={handleToggleStatus}>
            {updateStatus.isPending ? '...' : tenant.status === 'active' ? 'Pasif Yap' : 'Aktif Yap'}
          </Button>
          {confirmDelete ? (
            <>
              <Button variant="destructive" size="sm" className="h-6 px-2 text-[10px]" disabled={deleteTenant.isPending} onClick={handleDelete}>
                {deleteTenant.isPending ? '...' : 'Onayla'}
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setConfirmDelete(false)}>İptal</Button>
            </>
          ) : (
            <Button variant="destructive" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setConfirmDelete(true)}>Sil</Button>
          )}
        </div>
        {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
      </td>
    </tr>
  )
}

export default function TenantsPage() {
  const [page, setPage]         = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const limit = 25
  const { data, isLoading, error } = useTenants(page, limit)

  const tenants    = data?.data ?? []
  const meta       = data?.meta
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1
  const currentPage = meta?.page ?? page

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono ml-auto">{meta?.total ?? 0} tenant</span>
          <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>+ Yeni Tenant</Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Firma Yetkiler</span>
          <span className="text-xs text-muted-foreground font-mono">{meta?.total ?? 0} kayıt</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">Tenant listesi yüklenemedi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Firma</th>
                  <th className="px-4 py-2">Slug</th>
                  <th className="px-4 py-2">Durum</th>
                  <th className="px-4 py-2">Oluşturulma</th>
                  <th className="px-4 py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {tenants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      Henüz tenant oluşturulmamış.
                    </td>
                  </tr>
                ) : tenants.map((tenant) => (
                  <TenantRow key={tenant.id} tenant={tenant} />
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

      <CreateTenantDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
