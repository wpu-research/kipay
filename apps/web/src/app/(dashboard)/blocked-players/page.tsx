'use client'

import { useState } from 'react'
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
import { useBlockedPlayers, useBlockPlayer, useUnblockPlayer } from '@/features/blocked-players/use-blocked-players'
import { useMerchants } from '@/features/merchants/use-merchants'
import { useMe } from '@/features/auth/use-auth'
import type { BlockedPlayerItem } from '@panel/types'

function BlockStatusBadge({ item }: { item: BlockedPlayerItem }) {
  if (item.isPermanent) return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono bg-red-500/10 text-red-400 border border-red-500/20">
      Kalıcı
    </span>
  )
  if (item.blockedUntil && new Date(item.blockedUntil) > new Date()) return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono bg-orange-500/10 text-orange-400 border border-orange-500/20">
      {new Date(item.blockedUntil).toLocaleDateString('tr-TR')} kadar
    </span>
  )
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono bg-muted text-muted-foreground border">
      Süresi Dolmuş
    </span>
  )
}

function AddBlockDialog({
  open,
  onClose,
  onConfirm,
  isPending,
  merchants,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (data: { externalUserId: string; merchantId: string; blockedUntil?: string; permanent?: boolean }) => void
  isPending: boolean
  merchants: { id: string; merchantName: string }[]
}) {
  const [externalUserId, setExternalUserId] = useState('')
  const [merchantId, setMerchantId]         = useState('')
  const [permanent, setPermanent]           = useState(false)
  const [blockedUntil, setBlockedUntil]     = useState('')
  const [error, setError]                   = useState('')

  function handleConfirm() {
    setError('')
    if (!externalUserId.trim())      { setError('Oyuncu ID gerekli.'); return }
    if (!merchantId)                 { setError('Site seçilmeli.'); return }
    if (!permanent && !blockedUntil) { setError('Bitiş tarihi veya kalıcı seçeneği gerekli.'); return }
    if (!permanent && blockedUntil && new Date(blockedUntil) <= new Date()) {
      setError('Bitiş tarihi gelecekte olmalıdır.'); return
    }
    onConfirm({
      externalUserId: externalUserId.trim(),
      merchantId,
      ...(permanent ? { permanent: true } : { blockedUntil: new Date(blockedUntil).toISOString() }),
    })
  }

  function handleClose() {
    setExternalUserId(''); setMerchantId(''); setPermanent(false); setBlockedUntil(''); setError('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Oyuncu Engelle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Oyuncu ID (externalUserId)</label>
            <Input value={externalUserId} onChange={(e) => setExternalUserId(e.target.value)} placeholder="Oyuncu ID" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Site</label>
            <Select value={merchantId || '_none'} onValueChange={(v) => setMerchantId(v === '_none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Seçiniz..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Seçiniz...</SelectItem>
                {merchants.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.merchantName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="permanent" checked={permanent} onCheckedChange={(v) => setPermanent(!!v)} />
            <label htmlFor="permanent" className="text-sm">Kalıcı engel</label>
          </div>
          {!permanent && (
            <div className="space-y-1">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bitiş Tarihi</label>
              <Input type="datetime-local" value={blockedUntil} onChange={(e) => setBlockedUntil(e.target.value)} />
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>İptal</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Engelleniyor...' : 'Engelle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function BlockedPlayersPage() {
  const { data: meData }   = useMe()
  const role               = meData?.user?.role
  const [status, setStatus]             = useState<'all' | 'active' | 'expired'>('all')
  const [filterMerchantId, setFilterMerchantId] = useState<string | undefined>()
  const [page, setPage]                 = useState(1)
  const [addOpen, setAddOpen]           = useState(false)
  const [apiError, setApiError]         = useState('')

  const { data, isLoading, isError } = useBlockedPlayers({ merchantId: filterMerchantId, status, page })
  const { data: merchantsData }      = useMerchants(1, 100)
  const blockPlayer   = useBlockPlayer()
  const unblockPlayer = useUnblockPlayer()

  if (role && !['firma', 'super_admin'].includes(role)) {
    return <p className="text-sm text-muted-foreground">Bu sayfaya erişim yetkiniz yok.</p>
  }

  const merchants  = merchantsData?.data ?? []
  const items      = data?.data ?? []
  const total      = data?.total ?? 0
  const limit      = data?.limit ?? 20
  const totalPages = Math.ceil(total / limit) || 1

  function getMerchantName(id: string) {
    return merchants.find((m) => m.id === id)?.merchantName ?? id
  }

  async function handleBlock(input: { externalUserId: string; merchantId: string; blockedUntil?: string; permanent?: boolean }) {
    setApiError('')
    try {
      await blockPlayer.mutateAsync(input)
      setAddOpen(false)
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Bir hata oluştu.')
    }
  }

  async function handleUnblock(id: string) {
    setApiError('')
    try {
      await unblockPlayer.mutateAsync(id)
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Bir hata oluştu.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(1) }}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Kayıtlar</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="expired">Süresi Dolmuş</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filterMerchantId ?? '_all'}
            onValueChange={(v) => { setFilterMerchantId(v === '_all' ? undefined : v); setPage(1) }}
          >
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Tüm Siteler" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Tüm Siteler</SelectItem>
              {merchants.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.merchantName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="ml-auto text-xs text-muted-foreground font-mono">{total} kayıt</span>

          <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => setAddOpen(true)}>
            + Engel Ekle
          </Button>
        </div>
        {apiError && <p className="mt-2 text-xs text-destructive">{apiError}</p>}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Yatırım/Çekim Blacklist</span>
          <span className="text-xs text-muted-foreground font-mono">{total} kayıt</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : isError ? (
          <div className="py-16 text-center text-sm text-destructive">Veri yüklenemedi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Site</th>
                  <th className="px-4 py-2">Kullanıcı</th>
                  <th className="px-4 py-2">Durum</th>
                  <th className="px-4 py-2">Eklenme Tarihi</th>
                  <th className="px-4 py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">Kayıt bulunamadı.</td>
                  </tr>
                ) : items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-muted-foreground">{item.id.slice(0, 8)}</td>
                    <td className="px-4 py-2">
                      <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        {getMerchantName(item.merchantId)}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium font-mono">{item.externalUserId}</td>
                    <td className="px-4 py-2"><BlockStatusBadge item={item} /></td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 px-2 text-[10px]"
                        disabled={unblockPlayer.isPending}
                        onClick={() => handleUnblock(item.id)}
                      >
                        Sil
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground font-mono">
            <span>{((page - 1) * limit) + 1}–{Math.min(page * limit, total)} / {total}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        )}
      </div>

      <AddBlockDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onConfirm={handleBlock}
        isPending={blockPlayer.isPending}
        merchants={merchants}
      />
    </div>
  )
}
