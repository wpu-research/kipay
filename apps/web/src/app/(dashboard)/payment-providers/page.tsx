'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api-client'
import {
  usePaymentProviders,
  useCreatePaymentProvider,
  useUpdatePaymentProvider,
  usePaymentProviderCategories,
  useCreatePaymentProviderCategory,
  useUpdatePaymentProviderCategory,
} from '@/features/payment-providers/use-payment-providers'
import type { PaymentProvider, PaymentProviderCategory } from '@panel/types'

// --- Provider Dialogs ---

function CreateProviderDialog({
  open,
  onClose,
  onConfirm,
  isPending,
  error,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (data: { name: string }) => void
  isPending: boolean
  error: string | null
}) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) setName('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Yeni Ödeme Sağlayıcısı</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Sağlayıcı Adı *</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sağlayıcı adı"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            İptal
          </Button>
          <Button onClick={() => onConfirm({ name })} disabled={isPending || name.trim().length < 2}>
            {isPending ? 'Oluşturuluyor...' : 'Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditProviderDialog({
  provider,
  open,
  onClose,
}: {
  provider: PaymentProvider
  open: boolean
  onClose: () => void
}) {
  const [name, setName]     = useState(provider.name)
  const [status, setStatus] = useState<'active' | 'inactive'>(provider.status)
  const [error, setError]   = useState<string | null>(null)
  const update = useUpdatePaymentProvider(provider.id)

  useEffect(() => {
    if (open) {
      setName(provider.name)
      setStatus(provider.status)
      setError(null)
    }
  }, [open, provider])

  async function handleConfirm() {
    setError(null)
    try {
      await update.mutateAsync({ name, status })
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Güncellenemedi.')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Sağlayıcıyı Düzenle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Sağlayıcı Adı</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Durum</label>
            <Select value={status} onValueChange={(v) => setStatus(v as 'active' | 'inactive')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Pasif</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            İptal
          </Button>
          <Button onClick={handleConfirm} disabled={update.isPending || name.trim().length < 2}>
            {update.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProviderRow({ provider }: { provider: PaymentProvider }) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{provider.name}</span>
            <Badge variant={provider.status === 'active' ? 'default' : 'secondary'}>
              {provider.status === 'active' ? 'Aktif' : 'Pasif'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Oluşturulma: {new Date(provider.createdAt).toLocaleDateString('tr-TR')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          Düzenle
        </Button>
      </div>
      <EditProviderDialog
        provider={provider}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </>
  )
}

// --- Category Dialogs ---

function CreateCategoryDialog({
  open,
  onClose,
  onConfirm,
  isPending,
  error,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (data: { name: string }) => void
  isPending: boolean
  error: string | null
}) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) setName('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Yeni Kategori</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Kategori Adı *</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="örn. Havale, Kripto, Papara"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            İptal
          </Button>
          <Button onClick={() => onConfirm({ name })} disabled={isPending || name.trim().length < 2}>
            {isPending ? 'Oluşturuluyor...' : 'Oluştur'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditCategoryDialog({
  category,
  open,
  onClose,
}: {
  category: PaymentProviderCategory
  open: boolean
  onClose: () => void
}) {
  const [name, setName]   = useState(category.name)
  const [error, setError] = useState<string | null>(null)
  const update = useUpdatePaymentProviderCategory(category.id)

  useEffect(() => {
    if (open) {
      setName(category.name)
      setError(null)
    }
  }, [open, category])

  async function handleConfirm() {
    setError(null)
    try {
      await update.mutateAsync({ name })
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Güncellenemedi.')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Kategoriyi Düzenle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Kategori Adı</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            İptal
          </Button>
          <Button onClick={handleConfirm} disabled={update.isPending || name.trim().length < 2}>
            {update.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CategoryRow({ category }: { category: PaymentProviderCategory }) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div className="min-w-0 flex-1">
          <span className="font-medium">{category.name}</span>
          <p className="text-sm text-muted-foreground">
            Oluşturulma: {new Date(category.createdAt).toLocaleDateString('tr-TR')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          Düzenle
        </Button>
      </div>
      <EditCategoryDialog
        category={category}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </>
  )
}

// --- Main Page ---

export default function PaymentProvidersPage() {
  const [providerPage, setProviderPage]   = useState(1)
  const [categoryPage, setCategoryPage]   = useState(1)
  const limit = 20

  const { data: providersData, isLoading: providersLoading, error: providersError } = usePaymentProviders(providerPage, limit)
  const { data: categoriesData, isLoading: categoriesLoading, error: categoriesError } = usePaymentProviderCategories(categoryPage, limit)

  const createProvider = useCreatePaymentProvider()
  const createCategory = useCreatePaymentProviderCategory()

  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [providerCreateError, setProviderCreateError] = useState<string | null>(null)
  const [categoryCreateError, setCategoryCreateError] = useState<string | null>(null)

  const providerList  = providersData?.data  ?? []
  const categoryList  = categoriesData?.data ?? []
  const providerMeta  = providersData?.meta
  const categoryMeta  = categoriesData?.meta
  const providerPages = providerMeta  ? Math.max(1, Math.ceil(providerMeta.total  / providerMeta.limit))  : 1
  const categoryPages = categoryMeta ? Math.max(1, Math.ceil(categoryMeta.total / categoryMeta.limit)) : 1

  async function handleCreateProvider(data: { name: string }) {
    setProviderCreateError(null)
    try {
      await createProvider.mutateAsync(data)
      setProviderDialogOpen(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setProviderCreateError(err.message)
      } else {
        setProviderCreateError('Sağlayıcı oluşturulamadı.')
      }
    }
  }

  async function handleCreateCategory(data: { name: string }) {
    setCategoryCreateError(null)
    try {
      await createCategory.mutateAsync(data)
      setCategoryDialogOpen(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setCategoryCreateError(err.message)
      } else {
        setCategoryCreateError('Kategori oluşturulamadı.')
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ödeme Sağlayıcı Yönetimi</h1>

      {/* Sağlayıcılar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ödeme Sağlayıcıları</CardTitle>
              <CardDescription>
                {providerMeta ? `Toplam ${providerMeta.total} sağlayıcı` : 'Yükleniyor...'}
              </CardDescription>
            </div>
            <Button onClick={() => { setProviderCreateError(null); setProviderDialogOpen(true) }}>
              Yeni Sağlayıcı
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {providersLoading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : providersError ? (
            <p className="text-sm text-destructive">Sağlayıcı listesi yüklenemedi.</p>
          ) : providerList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz sağlayıcı oluşturulmamış.</p>
          ) : (
            <div className="space-y-2">
              {providerList.map((provider) => (
                <ProviderRow key={provider.id} provider={provider} />
              ))}
            </div>
          )}

          {providerPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={(providerMeta?.page ?? providerPage) <= 1}
                onClick={() => setProviderPage((p) => p - 1)}
              >
                Önceki
              </Button>
              <span className="text-sm text-muted-foreground">
                Sayfa {providerMeta?.page ?? providerPage} / {providerPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={(providerMeta?.page ?? providerPage) >= providerPages}
                onClick={() => setProviderPage((p) => p + 1)}
              >
                Sonraki
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kategoriler */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Kategoriler</CardTitle>
              <CardDescription>
                {categoryMeta ? `Toplam ${categoryMeta.total} kategori` : 'Yükleniyor...'}
              </CardDescription>
            </div>
            <Button onClick={() => { setCategoryCreateError(null); setCategoryDialogOpen(true) }}>
              Yeni Kategori
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {categoriesLoading ? (
            <p className="text-sm text-muted-foreground">Yükleniyor...</p>
          ) : categoriesError ? (
            <p className="text-sm text-destructive">Kategori listesi yüklenemedi.</p>
          ) : categoryList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kategori oluşturulmamış.</p>
          ) : (
            <div className="space-y-2">
              {categoryList.map((category) => (
                <CategoryRow key={category.id} category={category} />
              ))}
            </div>
          )}

          {categoryPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={(categoryMeta?.page ?? categoryPage) <= 1}
                onClick={() => setCategoryPage((p) => p - 1)}
              >
                Önceki
              </Button>
              <span className="text-sm text-muted-foreground">
                Sayfa {categoryMeta?.page ?? categoryPage} / {categoryPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={(categoryMeta?.page ?? categoryPage) >= categoryPages}
                onClick={() => setCategoryPage((p) => p + 1)}
              >
                Sonraki
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateProviderDialog
        open={providerDialogOpen}
        onClose={() => setProviderDialogOpen(false)}
        onConfirm={handleCreateProvider}
        isPending={createProvider.isPending}
        error={providerCreateError}
      />

      <CreateCategoryDialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        onConfirm={handleCreateCategory}
        isPending={createCategory.isPending}
        error={categoryCreateError}
      />
    </div>
  )
}
