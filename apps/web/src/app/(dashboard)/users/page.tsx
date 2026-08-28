'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api-client'
import { useUsers, useTenants, useUpdateUserStatus, useDeleteUser } from '@/features/users/use-users'
import { useMe } from '@/features/auth/use-auth'
import type { User } from '@panel/types'

const ROLE_LABELS: Record<User['role'], string> = {
  super_admin:     'Super Admin',
  tenant_admin:    'Tenant Admin',
  finans_admin:    'Finans Admin',
  finans_operator: 'Finans Operator',
  merchant:        'Merchant',
}

const ROLE_COLORS: Record<User['role'], string> = {
  super_admin:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
  tenant_admin:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  finans_admin:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  finans_operator: 'bg-green-500/10 text-green-400 border-green-500/20',
  merchant:        'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

function UserRow({ user, actorRole, actorId, showTenant }: {
  user: User
  actorRole: string | undefined
  actorId: string | undefined
  showTenant?: boolean
}) {
  const [error, setError]               = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const updateStatus = useUpdateUserStatus(user.id)
  const deleteUser   = useDeleteUser(user.id)

  const canToggle = actorRole !== undefined && actorRole !== 'merchant'
  const canDelete = (actorRole === 'super_admin' || actorRole === 'tenant_admin') && user.role !== 'super_admin'
  const isSelf    = actorId === user.id

  async function handleToggleStatus() {
    if (updateStatus.isPending) return
    setError(null)
    try {
      await updateStatus.mutateAsync(user.status === 'active' ? 'inactive' : 'active')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Durum güncellenemedi.')
    }
  }

  async function handleDelete() {
    setError(null)
    try {
      await deleteUser.mutateAsync()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kullanıcı silinemedi.')
    }
    setDeleteConfirm(false)
  }

  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-2 font-mono text-muted-foreground text-[11px]">{user.id.slice(0, 8)}</td>
      <td className="px-4 py-2 font-medium text-sm">
        {user.username}
        {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
      </td>
      {showTenant && (
        <td className="px-4 py-2 text-xs text-muted-foreground">{user.tenantName ?? '—'}</td>
      )}
      <td className="px-4 py-2">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono border ${ROLE_COLORS[user.role]}`}>
          {ROLE_LABELS[user.role]}
        </span>
      </td>
      <td className="px-4 py-2">
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold font-mono border ${
          user.status === 'active'
            ? 'bg-green-500/10 text-green-400 border-green-500/20'
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          {user.status === 'active' ? 'Aktif' : 'Pasif'}
        </span>
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
        {new Date(user.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          {canToggle && (
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" disabled={updateStatus.isPending} onClick={handleToggleStatus}>
              {updateStatus.isPending ? '...' : user.status === 'active' ? 'Pasif Yap' : 'Aktif Yap'}
            </Button>
          )}
          {canDelete && !isSelf && (
            deleteConfirm ? (
              <div className="flex gap-1">
                <Button variant="destructive" size="sm" className="h-6 px-2 text-[10px]" disabled={deleteUser.isPending} onClick={handleDelete}>
                  {deleteUser.isPending ? '...' : 'Onayla'}
                </Button>
                <Button variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setDeleteConfirm(false)}>
                  İptal
                </Button>
              </div>
            ) : (
              <Button variant="destructive" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setDeleteConfirm(true)}>
                Sil
              </Button>
            )
          )}
        </div>
      </td>
    </tr>
  )
}

export default function UsersPage() {
  const [page, setPage]                   = useState(1)
  const [selectedTenant, setSelectedTenant] = useState('')
  const limit = 25

  const { data: meData }  = useMe()
  const actorRole         = meData?.user?.role
  const actorId           = meData?.user?.id
  const isSuperAdmin      = actorRole === 'super_admin'

  const { data: tenantsData } = useTenants()
  const tenantList            = tenantsData?.data ?? []

  const filterTenantId = isSuperAdmin ? (selectedTenant || undefined) : undefined
  const { data, isLoading, error } = useUsers(page, limit, filterTenantId)

  const users       = data?.data ?? []
  const meta        = data?.meta
  const totalPages  = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1
  const currentPage = meta?.page ?? page
  const showTenant  = isSuperAdmin && !selectedTenant

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-2 items-center">
          {isSuperAdmin && tenantList.length > 0 && (
            <Select value={selectedTenant || '_all'} onValueChange={(v) => { setSelectedTenant(v === '_all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Tüm Tenantlar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Tüm Tenantlar</SelectItem>
                {tenantList.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <span className="ml-auto text-xs text-muted-foreground font-mono">
            {meta ? `${meta.total} kullanıcı` : ''}
          </span>

          <Button size="sm" className="h-8 text-xs" asChild>
            <Link href="/users/new">+ Yeni Kullanıcı</Link>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Kullanıcılar</span>
          <span className="text-xs text-muted-foreground font-mono">{meta?.total ?? 0} kayıt</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-destructive">Kullanıcı listesi yüklenemedi.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Kullanıcı Adı</th>
                  {showTenant && <th className="px-4 py-2">Tenant</th>}
                  <th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2">Durum</th>
                  <th className="px-4 py-2">Oluşturulma</th>
                  <th className="px-4 py-2">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={showTenant ? 7 : 6} className="py-12 text-center text-muted-foreground">
                      Henüz kullanıcı oluşturulmamış.
                    </td>
                  </tr>
                ) : users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    actorRole={actorRole}
                    actorId={actorId}
                    showTenant={showTenant}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground font-mono">
            <span>{((currentPage - 1) * limit) + 1}–{Math.min(currentPage * limit, meta?.total ?? 0)} / {meta?.total ?? 0}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage(1)}>«</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>‹</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>›</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
