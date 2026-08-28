'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuditLogs } from '@/features/audit-logs/use-audit-logs'
import { useMe } from '@/features/auth/use-me'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  'transaction.claim':   { label: 'İşlem Al',  color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  'transaction.approve': { label: 'Onayla',     color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  'transaction.reject':  { label: 'Reddet',     color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  'transaction.flag':    { label: 'Şüpheli',    color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  'transaction.resolve': { label: 'Kapat',      color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  'login':               { label: 'Giriş',      color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  'logout':              { label: 'Çıkış',      color: 'bg-muted/50 text-muted-foreground border' },
}

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_LABELS[action]
  if (cfg) {
    return (
      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono border ${cfg.color}`}>
        {cfg.label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground border">
      {action}
    </span>
  )
}

const TRANSACTION_ACTIONS = [
  'transaction.claim',
  'transaction.approve',
  'transaction.reject',
  'transaction.flag',
  'transaction.resolve',
]

export default function UserActivityPage() {
  useMe()
  const [page, setPage]         = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [searchUser, setSearchUser]     = useState('')
  const [searchInput, setSearchInput]   = useState('')
  const limit = 50

  const { data, isLoading, isError } = useAuditLogs({
    page,
    limit,
    action:       actionFilter || undefined,
    resourceType: 'transaction',
    resourceId:   searchUser || undefined,
  })

  const logs       = data?.data ?? []
  const meta       = data?.meta
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1
  const filtered   = logs

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={actionFilter || '_all'} onValueChange={(v) => { setActionFilter(v === '_all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Tüm İşlem Tipleri" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Tüm İşlem Tipleri</SelectItem>
              {TRANSACTION_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-1">
            <Input
              placeholder="İşlem ID (UUID)..."
              className="h-8 w-56 text-xs"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setSearchUser(searchInput); setPage(1) } }}
            />
            <Button size="sm" className="h-8 px-3 text-xs" onClick={() => { setSearchUser(searchInput); setPage(1) }}>
              Ara
            </Button>
          </div>

          <span className="ml-auto text-xs text-muted-foreground font-mono">
            {meta?.total ?? 0} kayıt
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Kullanıcı Hareketleri</span>
          <span className="text-xs text-muted-foreground font-mono">İşlem aksiyonları</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : isError ? (
          <div className="py-16 text-center text-sm text-destructive">Veriler yüklenemedi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Kullanıcı</th>
                  <th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2">İşlem Tipi</th>
                  <th className="px-4 py-2">İşlem ID</th>
                  <th className="px-4 py-2">IP Adresi</th>
                  <th className="px-4 py-2">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      Kayıt bulunamadı.
                    </td>
                  </tr>
                ) : filtered.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 font-mono text-muted-foreground">{log.id.slice(0, 8)}</td>
                    <td className="px-4 py-2 font-medium">{log.userId.slice(0, 8)}…</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-[10px]">{log.userRole}</td>
                    <td className="px-4 py-2"><ActionBadge action={log.action} /></td>
                    <td className="px-4 py-2 font-mono text-muted-foreground text-[10px]">
                      {log.resourceId ? log.resourceId.slice(0, 13) + '…' : '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-muted-foreground">{log.ip}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground font-mono">
            <span>{((page - 1) * limit) + 1}–{Math.min(page * limit, meta?.total ?? 0)} / {meta?.total ?? 0}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>«</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
