'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { UserListResponse } from '@panel/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { useAuditLogs } from '@/features/audit-logs/use-audit-logs'
import { useMe } from '@/features/auth/use-me'
import { useTenants } from '@/features/users/use-users'
import type { AuditLog } from '@panel/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'medium' })
}

function ChangesPreview({ changes }: { changes: unknown }) {
  if (changes == null) return <span className="text-muted-foreground">—</span>
  const str = JSON.stringify(changes)
  const preview = str.length > 60 ? str.slice(0, 60) + '…' : str
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-xs">{preview}</code>
  )
}

function AuditLogTableRow({ log }: { log: AuditLog }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDate(log.timestamp)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{log.userRole}</TableCell>
      <TableCell className="font-mono text-xs">{log.action}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{log.resourceType}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{log.ip}</TableCell>
      <TableCell><ChangesPreview changes={log.changes} /></TableCell>
    </TableRow>
  )
}

export default function AuditLogsPage() {
  const { data: meData } = useMe()
  const isSuperAdmin = meData?.user?.role === 'super_admin'

  const [page, setPage] = useState(1)

  if (meData && !isSuperAdmin) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    )
  }
  const limit = 20

  const [fromDraft, setFromDraft]                 = useState<Date | undefined>(undefined)
  const [toDraft, setToDraft]                     = useState<Date | undefined>(undefined)
  const [actionDraft, setActionDraft]             = useState('')
  const [tenantIdDraft, setTenantIdDraft]         = useState('all')
  const [userIdDraft, setUserIdDraft]             = useState('all')
  const [resourceTypeDraft, setResourceTypeDraft] = useState('')

  const { data: tenantsData } = useTenants()
  const tenantList = tenantsData?.data ?? []

  const selectedTenantId = tenantIdDraft !== 'all' ? tenantIdDraft : undefined
  const { data: usersData } = useQuery({
    queryKey: ['audit-users', selectedTenantId],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', limit: '100' })
      if (selectedTenantId) params.set('tenantId', selectedTenantId)
      return apiClient.get<UserListResponse>(`/api/v1/users?${params}`)
    },
  })
  const userList = usersData?.data ?? []

  function handleTenantChange(value: string) {
    setTenantIdDraft(value)
    setUserIdDraft('all')
  }

  const [fromApplied, setFromApplied]                 = useState<Date | undefined>(undefined)
  const [toApplied, setToApplied]                     = useState<Date | undefined>(undefined)
  const [actionApplied, setActionApplied]             = useState('')
  const [userIdApplied, setUserIdApplied]             = useState('all')
  const [resourceTypeApplied, setResourceTypeApplied] = useState('')
  const [tenantIdApplied, setTenantIdApplied]         = useState('all')

  const [filterError, setFilterError] = useState<string | null>(null)
  const [exporting, setExporting]     = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const fromISO = fromApplied ? fromApplied.toISOString() : undefined
  const toISO   = toApplied   ? new Date(toApplied.getFullYear(), toApplied.getMonth(), toApplied.getDate(), 23, 59, 59, 999).toISOString() : undefined

  const { data, isLoading, error } = useAuditLogs({
    page,
    limit,
    from:         fromISO,
    to:           toISO,
    action:       actionApplied || undefined,
    userId:       (userIdApplied && userIdApplied !== 'all') ? userIdApplied : undefined,
    resourceType: resourceTypeApplied || undefined,
    tenantId:     isSuperAdmin ? ((tenantIdApplied && tenantIdApplied !== 'all') ? tenantIdApplied : undefined) : undefined,
  })

  const logs        = data?.data ?? []
  const meta        = data?.meta
  const totalPages  = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1
  const currentPage = meta?.page ?? page

  function applyFilters(e: React.FormEvent) {
    e.preventDefault()
    if (fromDraft && toDraft && fromDraft > toDraft) {
      setFilterError('Başlangıç tarihi bitiş tarihinden sonra olamaz.')
      return
    }
    setFilterError(null)
    setFromApplied(fromDraft)
    setToApplied(toDraft)
    setActionApplied(actionDraft)
    setUserIdApplied(userIdDraft)
    setResourceTypeApplied(resourceTypeDraft)
    setTenantIdApplied(tenantIdDraft)
    setPage(1)
  }

  function clearFilters() {
    setFromDraft(undefined); setToDraft(undefined); setActionDraft('')
    setUserIdDraft('all'); setResourceTypeDraft(''); setTenantIdDraft('all')
    setFromApplied(undefined); setToApplied(undefined); setActionApplied('')
    setUserIdApplied('all'); setResourceTypeApplied(''); setTenantIdApplied('all')
    setFilterError(null)
    setPage(1)
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    setExporting(true)
    setExportError(null)
    try {
      const body: Record<string, string> = { format }
      if (fromISO)                                        body.from         = fromISO
      if (toISO)                                          body.to           = toISO
      if (actionApplied)                                  body.action       = actionApplied
      if (userIdApplied && userIdApplied !== 'all')       body.userId       = userIdApplied
      if (tenantIdApplied && tenantIdApplied !== 'all')   body.tenantId     = tenantIdApplied
      if (resourceTypeApplied)                            body.resourceType = resourceTypeApplied

      const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/v1/audit-logs/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        let message = 'Export başarısız'
        try { message = (JSON.parse(text) as { error?: { message?: string } })?.error?.message ?? message } catch { /* ignore */ }
        throw new Error(message)
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export başarısız')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Audit Loglar</h1>
          <p className="text-sm text-muted-foreground">Sistemdeki tüm işlem kayıtları</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExport('csv')}>
            {exporting ? 'İndiriliyor…' : 'CSV İndir'}
          </Button>
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => handleExport('xlsx')}>
            {exporting ? 'İndiriliyor…' : 'Excel İndir'}
          </Button>
        </div>
      </div>

      {exportError && <p className="text-sm text-destructive">{exportError}</p>}

      {/* Filtreler */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtreler</CardTitle>
        </CardHeader>
        <CardContent>
          {filterError && <p className="mb-3 text-sm text-destructive">{filterError}</p>}
          <form onSubmit={applyFilters}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <div className="space-y-1.5">
                <Label className="text-xs">Başlangıç</Label>
                <DatePicker value={fromDraft} onChange={setFromDraft} placeholder="Başlangıç tarihi" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bitiş</Label>
                <DatePicker value={toDraft} onChange={setToDraft} placeholder="Bitiş tarihi" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Action</Label>
                <Input placeholder="örn. tenant.created" value={actionDraft} onChange={e => setActionDraft(e.target.value)} />
              </div>
              {isSuperAdmin && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Tenant</Label>
                  <Select value={tenantIdDraft} onValueChange={handleTenantChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tümü" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tümü</SelectItem>
                      {tenantList.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Kullanıcı</Label>
                <Select value={userIdDraft} onValueChange={setUserIdDraft}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tümü" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tümü</SelectItem>
                    {userList.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Kaynak Türü</Label>
                <Select value={resourceTypeDraft || 'all'} onValueChange={v => setResourceTypeDraft(v === 'all' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tümü" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tümü</SelectItem>
                    <SelectItem value="tenant">tenant</SelectItem>
                    <SelectItem value="merchant">merchant</SelectItem>
                    <SelectItem value="merchant_api_key">merchant_api_key</SelectItem>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="transaction">transaction</SelectItem>
                    <SelectItem value="payment_account">payment_account</SelectItem>
                    <SelectItem value="payment_provider">payment_provider</SelectItem>
                    <SelectItem value="payment_provider_category">payment_provider_category</SelectItem>
                    <SelectItem value="system_settings">system_settings</SelectItem>
                    <SelectItem value="warning_rule">warning_rule</SelectItem>
                    <SelectItem value="warning">warning</SelectItem>
                    <SelectItem value="blocked_player">blocked_player</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="submit" size="sm">Filtrele</Button>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Temizle</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Log tablosu */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log Kayıtları</CardTitle>
          <CardDescription>
            {meta ? `Toplam ${meta.total.toLocaleString('tr-TR')} kayıt` : ''}
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
            <p className="p-6 text-sm text-destructive">Log kayıtları yüklenemedi.</p>
          ) : logs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Kayıt bulunamadı.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">Zaman</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">Rol</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">Action</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">Kaynak Türü</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">IP</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">Değişiklikler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <AuditLogTableRow key={log.id} log={log} />
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between p-4">
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
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
