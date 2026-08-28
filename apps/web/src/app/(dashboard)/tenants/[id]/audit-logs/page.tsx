'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useTenantAuditLogs } from '@/features/audit-logs/use-audit-logs'
import type { AuditLog } from '@panel/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' })
}

function ChangesPreview({ changes }: { changes: unknown }) {
  if (changes == null) return <span className="text-muted-foreground">—</span>
  const str = JSON.stringify(changes)
  const preview = str.length > 80 ? str.slice(0, 80) + '…' : str
  return <code className="text-xs">{preview}</code>
}

function AuditLogRow({ log }: { log: AuditLog }) {
  return (
    <div className="grid grid-cols-7 gap-2 rounded border p-3 text-sm">
      <div className="text-muted-foreground">{formatDate(log.timestamp)}</div>
      <div>
        <Badge variant="outline" className="text-xs">{log.userRole}</Badge>
      </div>
      <div className="font-mono text-xs">{log.action}</div>
      <div className="text-muted-foreground">{log.resourceType}</div>
      <div className="truncate font-mono text-xs text-muted-foreground">{log.resourceId ?? '—'}</div>
      <div className="text-muted-foreground">{log.ip}</div>
      <div><ChangesPreview changes={log.changes} /></div>
    </div>
  )
}

export default function TenantAuditLogsPage() {
  const params = useParams<{ id: string }>()
  const tenantId = params.id

  const [page, setPage] = useState(1)
  // Draft state — kullanıcı input değiştirir ama henüz submit etmemiştir
  const [fromDraft, setFromDraft] = useState('')
  const [toDraft, setToDraft]     = useState('')
  const [actionDraft, setActionDraft] = useState('')
  // Applied state — yalnızca "Filtrele" submit edilince güncellenir
  const [fromApplied, setFromApplied] = useState('')
  const [toApplied, setToApplied]     = useState('')
  const [actionApplied, setActionApplied] = useState('')
  const [filterError, setFilterError] = useState<string | null>(null)
  const limit = 20

  // API'ye gönderilecek ISO UTC değerleri: applied state'den üretilir
  const fromISO = fromApplied ? new Date(fromApplied).toISOString() : undefined
  const toISO   = toApplied   ? new Date(toApplied).toISOString()   : undefined

  const { data, isLoading, error } = useTenantAuditLogs(tenantId, {
    page,
    limit,
    from: fromISO,
    to:   toISO,
    action: actionApplied || undefined,
  })

  const logs = data?.data ?? []
  const meta = data?.meta
  const totalPages = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1
  const currentPage = meta?.page ?? page

  function applyFilters(e: React.FormEvent) {
    e.preventDefault()
    if (fromDraft && toDraft && new Date(fromDraft) > new Date(toDraft)) {
      setFilterError('Başlangıç tarihi bitiş tarihinden sonra olamaz.')
      return
    }
    setFilterError(null)
    setFromApplied(fromDraft)
    setToApplied(toDraft)
    setActionApplied(actionDraft)
    setPage(1)
  }

  function clearFilters() {
    setFromDraft('')
    setToDraft('')
    setActionDraft('')
    setFromApplied('')
    setToApplied('')
    setActionApplied('')
    setFilterError(null)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/tenants">← Tenant Listesi</Link>
        </Button>
        <h1 className="text-2xl font-bold">Audit Log</h1>
      </div>

      {/* Filtreler */}
      <Card>
        <CardHeader>
          <CardTitle>Filtrele</CardTitle>
        </CardHeader>
        <CardContent>
          {filterError && (
            <p className="mb-2 text-sm text-destructive">{filterError}</p>
          )}
          <form onSubmit={applyFilters} className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Başlangıç</label>
              <Input
                type="datetime-local"
                value={fromDraft}
                onChange={e => setFromDraft(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Bitiş</label>
              <Input
                type="datetime-local"
                value={toDraft}
                onChange={e => setToDraft(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Action</label>
              <Input
                type="text"
                placeholder="örn. tenant.created"
                value={actionDraft}
                onChange={e => setActionDraft(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" size="sm">Filtrele</Button>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                Temizle
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Log listesi */}
      <Card>
        <CardHeader>
          <CardTitle>Log Kayıtları</CardTitle>
          <CardDescription>
            {meta ? `Toplam ${meta.total} kayıt` : 'Yükleniyor...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Sütun başlıkları */}
          <div className="mb-2 grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground">
            <div>Zaman</div>
            <div>Rol</div>
            <div>Action</div>
            <div>Kaynak Türü</div>
            <div>Kaynak ID</div>
            <div>IP</div>
            <div>Değişiklikler</div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : error ? (
            <p className="text-sm text-destructive">Log kayıtları yüklenemedi.</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kayıt bulunamadı.</p>
          ) : (
            <div className="space-y-1">
              {logs.map((log) => (
                <AuditLogRow key={log.id} log={log} />
              ))}
            </div>
          )}

          {/* Sayfalama */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
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
                onClick={() => setPage(currentPage + 1)}
              >
                Sonraki
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
