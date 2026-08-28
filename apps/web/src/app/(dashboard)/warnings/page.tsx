'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  useWarningRules,
  useCreateWarningRule,
  useUpdateWarningRuleStatus,
  useWarnings,
  useAcknowledgeWarning,
} from '@/features/warnings/use-warnings'
import { useMe } from '@/features/auth/use-auth'

const RULE_TYPE_LABELS: Record<string, string> = {
  transaction_frequency: 'İşlem Sıklığı',
  amount_threshold:      'Tutar Eşiği',
  repeat_rejection:      'Tekrarlı Red',
}

function AddRuleDialog({
  open,
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean
  onClose: () => void
  onConfirm: (data: { ruleType: string; threshold: number; windowMinutes?: number; merchantId?: string }) => void
  isPending: boolean
}) {
  const [ruleType, setRuleType]           = useState('amount_threshold')
  const [threshold, setThreshold]         = useState('')
  const [windowMinutes, setWindowMinutes] = useState('')
  const [merchantId, setMerchantId]       = useState('')
  const [error, setError]                 = useState('')

  function handleConfirm() {
    setError('')
    const thresholdNum = parseFloat(threshold)
    if (!threshold || isNaN(thresholdNum) || thresholdNum <= 0) {
      setError('Eşik değeri pozitif bir sayı olmalıdır.'); return
    }
    if ((ruleType === 'transaction_frequency' || ruleType === 'repeat_rejection') && !windowMinutes) {
      setError('Bu kural tipi için zaman penceresi zorunludur.'); return
    }
    const winMin = windowMinutes ? parseInt(windowMinutes, 10) : undefined
    if (winMin !== undefined && (isNaN(winMin) || winMin <= 0)) {
      setError('Zaman penceresi pozitif bir tam sayı olmalıdır.'); return
    }
    onConfirm({
      ruleType,
      threshold: thresholdNum,
      ...(winMin ? { windowMinutes: winMin } : {}),
      ...(merchantId.trim() ? { merchantId: merchantId.trim() } : {}),
    })
  }

  function handleClose() {
    setRuleType('amount_threshold')
    setThreshold('')
    setWindowMinutes('')
    setMerchantId('')
    setError('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Uyarı Kuralı Ekle</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Kural Tipi</label>
            <Select value={ruleType} onValueChange={setRuleType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount_threshold">Tutar Eşiği</SelectItem>
                <SelectItem value="transaction_frequency">İşlem Sıklığı</SelectItem>
                <SelectItem value="repeat_rejection">Tekrarlı Red</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">Eşik Değeri</label>
            <Input
              type="number"
              className="mt-1"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              placeholder={ruleType === 'amount_threshold' ? 'Örn: 10000' : 'Örn: 5'}
            />
          </div>
          {(ruleType === 'transaction_frequency' || ruleType === 'repeat_rejection') && (
            <div>
              <label className="text-sm font-medium">Zaman Penceresi (dakika)</label>
              <Input
                type="number"
                className="mt-1"
                value={windowMinutes}
                onChange={e => setWindowMinutes(e.target.value)}
                placeholder="Örn: 60"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Site ID (opsiyonel)</label>
            <Input
              className="mt-1"
              value={merchantId}
              onChange={e => setMerchantId(e.target.value)}
              placeholder="Boş bırakırsanız tüm siteler için geçerli"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>İptal</Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RulesTab() {
  const [page, setPage]     = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [apiError, setApiError] = useState('')

  const { data, isLoading, isError } = useWarningRules({ page })
  const createRule   = useCreateWarningRule()
  const updateStatus = useUpdateWarningRuleStatus()

  const rules      = (data as any)?.data ?? []
  const total: number = (data as any)?.meta?.total ?? 0
  const limit: number = (data as any)?.meta?.limit ?? 20
  const totalPages = Math.ceil(total / limit) || 1

  async function handleCreate(input: { ruleType: string; threshold: number; windowMinutes?: number; merchantId?: string }) {
    setApiError('')
    try {
      await createRule.mutateAsync(input as any)
      setAddOpen(false)
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Bir hata oluştu.')
    }
  }

  async function handleToggle(id: string, current: boolean) {
    setApiError('')
    try {
      await updateStatus.mutateAsync({ id, isActive: !current })
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Bir hata oluştu.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Toplam {total} kural</p>
        <Button onClick={() => setAddOpen(true)}>Kural Ekle</Button>
      </div>

      {apiError && <p className="text-sm text-red-600">{apiError}</p>}

      <Card>
        <CardContent className="pt-4">
          {isLoading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}
          {isError   && <p className="text-sm text-red-600">Veri yüklenemedi.</p>}
          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Kural Tipi</th>
                    <th className="pb-2 pr-4">Eşik</th>
                    <th className="pb-2 pr-4">Pencere (dk)</th>
                    <th className="pb-2 pr-4">Site</th>
                    <th className="pb-2 pr-4">Durum</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Kural bulunamadı.</td></tr>
                  )}
                  {rules.map((rule: any) => (
                    <tr key={rule.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType}</td>
                      <td className="py-2 pr-4">{parseFloat(rule.threshold).toLocaleString('tr-TR')}</td>
                      <td className="py-2 pr-4">{rule.windowMinutes ?? '—'}</td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{rule.merchantId ?? 'Tümü'}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                          {rule.isActive ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={updateStatus.isPending}
                          onClick={() => handleToggle(rule.id, rule.isActive)}
                        >
                          {rule.isActive ? 'Pasif Yap' : 'Aktif Yap'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Önceki</Button>
          <span className="text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sonraki</Button>
        </div>
      )}

      <AddRuleDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onConfirm={handleCreate}
        isPending={createRule.isPending}
      />
    </div>
  )
}

function WarningsTab() {
  const [status, setStatus]   = useState('all')
  const [ruleType, setRuleType] = useState<string | undefined>()
  const [page, setPage]       = useState(1)
  const [apiError, setApiError] = useState('')

  const { data, isLoading, isError } = useWarnings({ status, ruleType, page })
  const acknowledge = useAcknowledgeWarning()

  const items: any[]  = (data as any)?.data ?? []
  const total: number = (data as any)?.meta?.total ?? 0
  const limit: number = (data as any)?.meta?.limit ?? 20
  const totalPages    = Math.ceil(total / limit) || 1

  async function handleAcknowledge(id: string) {
    setApiError('')
    try {
      await acknowledge.mutateAsync(id)
    } catch (e) {
      setApiError(e instanceof ApiError ? e.message : 'Bir hata oluştu.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="open">Açık</SelectItem>
            <SelectItem value="acknowledged">Kabul Edilmiş</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ruleType ?? '_none'} onValueChange={(v) => { setRuleType(v === '_none' ? undefined : v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tüm Kural Tipleri" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">Tüm Kural Tipleri</SelectItem>
            <SelectItem value="transaction_frequency">İşlem Sıklığı</SelectItem>
            <SelectItem value="amount_threshold">Tutar Eşiği</SelectItem>
            <SelectItem value="repeat_rejection">Tekrarlı Red</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {apiError && <p className="text-sm text-red-600">{apiError}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Uyarılar ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}
          {isError   && <p className="text-sm text-red-600">Veri yüklenemedi.</p>}
          {!isLoading && !isError && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Kural Tipi</th>
                    <th className="pb-2 pr-4">Tetiklenme</th>
                    <th className="pb-2 pr-4">İşlem ID</th>
                    <th className="pb-2 pr-4">Durum</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Uyarı bulunamadı.</td></tr>
                  )}
                  {items.map((item: any) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {RULE_TYPE_LABELS[(item.metadata as any)?.ruleType] ?? '—'}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(item.triggeredAt).toLocaleString('tr-TR')}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {item.transactionId ? item.transactionId.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={item.status === 'open' ? 'destructive' : 'secondary'}>
                          {item.status === 'open' ? 'Açık' : 'Kabul Edildi'}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        {item.status === 'open' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={acknowledge.isPending}
                            onClick={() => handleAcknowledge(item.id)}
                          >
                            Kabul Et
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Önceki</Button>
          <span className="text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sonraki</Button>
        </div>
      )}
    </div>
  )
}

export default function WarningsPage() {
  const { data: meData } = useMe()
  const role = meData?.user?.role

  const [activeTab, setActiveTab] = useState<'rules' | 'warnings'>('rules')

  if (role && !['firma', 'super_admin'].includes(role)) {
    return <p className="p-6 text-sm text-muted-foreground">Bu sayfaya erişim yetkiniz yok.</p>
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Uyarı Sistemi</h1>

      <div className="flex gap-2 border-b pb-0">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'rules'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('rules')}
        >
          Kurallar
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'warnings'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('warnings')}
        >
          Uyarılar
        </button>
      </div>

      <div>
        {activeTab === 'rules'    && <RulesTab />}
        {activeTab === 'warnings' && <WarningsTab />}
      </div>
    </div>
  )
}
