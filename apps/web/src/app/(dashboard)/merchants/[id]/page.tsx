'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api-client'
import {
  useMerchantApiKeys,
  useCreateApiKey,
  useRotateApiKey,
  useIpWhitelist,
  useAddIp,
  useRemoveIp,
} from '@/features/merchants/use-merchant-api-keys'
import { useMe } from '@/features/auth/use-auth'
import { useMerchant, useRegenerateCallbackSecret, useUpdateMerchantStatus } from '@/features/merchants/use-merchants'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

function CredentialsSection({
  merchantId,
  canManage,
}: {
  merchantId: string
  canManage: boolean
}) {
  const { data: keysData, isLoading } = useMerchantApiKeys(merchantId)
  const createApiKey = useCreateApiKey(merchantId)
  const rotateApiKey = useRotateApiKey(merchantId)
  const regenerateCbSecret = useRegenerateCallbackSecret(merchantId)

  const [credentials, setCredentials] = useState<{
    keyId: string
    secret: string
    cbSecret: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const activeKey = keysData?.data?.find((k) => k.status === 'active')
  const isPending = createApiKey.isPending || rotateApiKey.isPending || regenerateCbSecret.isPending

  async function handleRenewAll() {
    setError(null)
    try {
      const [apiKeyResult, cbSecretResult] = await Promise.all([
        activeKey
          ? rotateApiKey.mutateAsync(activeKey.keyId)
          : createApiKey.mutateAsync({}),
        regenerateCbSecret.mutateAsync(),
      ])
      setCredentials({
        keyId: apiKeyResult.data.keyId,
        secret: apiKeyResult.data.secret,
        cbSecret: cbSecretResult.data.callbackSecret ?? '',
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Credentials yenilenemedi.')
    }
  }

  const envText = credentials
    ? `ID=${merchantId}\nKEY_ID=${credentials.keyId}\nSECRET=${credentials.secret}\nCB_SECRET=${credentials.cbSecret}`
    : ''

  async function handleCopy() {
    await navigator.clipboard.writeText(envText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>API Credentials</CardTitle>
            <CardDescription>API key ve callback secret — tek seferde yenile</CardDescription>
          </div>
          {canManage && !isLoading && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isPending}>
                  {isPending ? 'Yenileniyor...' : 'Tümünü Yenile'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tüm Credentials Yenilensin mi?</AlertDialogTitle>
                  <AlertDialogDescription>
                    API key ve callback secret aynı anda yenilenecek. Mevcut değerler geçersiz hale gelecek.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>İptal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRenewAll}>Yenile</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && (
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? 'Yükleniyor...'
              : 'Güvenlik nedeniyle gösterilmiyor. "Tümünü Yenile" ile API key ve callback secret aynı anda yenilenir.'}
          </p>
        )}
      </CardContent>

      <Dialog open={!!credentials} onOpenChange={(v) => !v && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Credentials — Tek Seferlik Gösterim</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-destructive font-medium">
              ⚠️ Bu değerler bir daha görüntülenemez. Hemen kopyalayın!
            </p>
            <pre className="rounded-md bg-muted p-3 font-mono text-sm whitespace-pre-wrap break-all">
              {envText}
            </pre>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? 'Kopyalandı ✓' : 'Tümünü Kopyala'}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>Tamam, Kopyaladım</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function IpWhitelistSection({
  merchantId,
  canManage,
}: {
  merchantId: string
  canManage: boolean
}) {
  const { data, isLoading } = useIpWhitelist(merchantId)
  const addIp    = useAddIp(merchantId)
  const removeIp = useRemoveIp(merchantId)

  const [ipInput, setIpInput] = useState('')
  const [error, setError]     = useState<string | null>(null)

  const entries = data?.data ?? []

  useEffect(() => {
    setError(null)
  }, [ipInput])

  async function handleAdd() {
    const ip = ipInput.trim()
    if (!ip) return
    setError(null)
    try {
      await addIp.mutateAsync({ ipAddress: ip })
      setIpInput('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'IP eklenemedi.')
    }
  }

  async function handleRemove(ip: string) {
    setError(null)
    try {
      await removeIp.mutateAsync(ip)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'IP kaldırılamadı.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>IP Whitelist</CardTitle>
        <CardDescription>Site için izin verilen IP adresleri</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        {canManage && (
          <div className="mb-4 flex gap-2">
            <Input
              type="text"
              value={ipInput}
              onChange={(e) => setIpInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="192.168.1.1"
              className="flex-1"
            />
            <Button onClick={handleAdd} disabled={addIp.isPending || !ipInput.trim()}>
              {addIp.isPending ? 'Ekleniyor...' : 'Ekle'}
            </Button>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Yükleniyor...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tüm IP&apos;lere izin verilmektedir (whitelist boş).
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <div>
                  <span className="font-mono text-sm">{entry.ipAddress}</span>
                  <p className="text-xs text-muted-foreground">
                    Eklenme: {new Date(entry.createdAt).toLocaleDateString('tr-TR')}
                  </p>
                </div>
                {canManage && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={removeIp.isPending}
                    onClick={() => handleRemove(entry.ipAddress)}
                  >
                    Kaldır
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function MerchantDetailPage() {
  const params     = useParams<{ id: string }>()
  const merchantId = params.id
  const { data: meData } = useMe()
  const { data: merchantData } = useMerchant(merchantId)
  const updateStatus = useUpdateMerchantStatus(merchantId)
  const actorRole = meData?.user?.role

  const canManage = actorRole === 'super_admin' || actorRole === 'tenant_admin'
  const merchantName = merchantData?.data?.merchantName
  const tenantName = merchantData?.data?.tenantName
  const currentStatus = merchantData?.data?.status

  function handleStatusToggle(checked: boolean) {
    updateStatus.mutate(checked ? 'active' : 'inactive')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {merchantName ?? 'Site Detayı'}
          {tenantName && (
            <span className="ml-2 text-lg font-normal text-muted-foreground">({tenantName})</span>
          )}
        </h1>
        {canManage && currentStatus !== undefined && (
          <div className="flex items-center gap-2">
            <Switch
              id="merchant-status"
              checked={currentStatus === 'active'}
              onCheckedChange={handleStatusToggle}
              disabled={updateStatus.isPending}
            />
            <Label htmlFor="merchant-status" className="text-sm">
              {currentStatus === 'active' ? 'Aktif' : 'Pasif'}
            </Label>
          </div>
        )}
      </div>

      <CredentialsSection merchantId={merchantId} canManage={canManage} />
      <IpWhitelistSection merchantId={merchantId} canManage={canManage} />
    </div>
  )
}
