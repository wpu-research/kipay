'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DateRangePicker, type DateRange } from '@/components/ui/date-picker'
import { useMe } from '@/features/auth/use-me'
import { useMerchants } from '@/features/merchants/use-merchants'
import {
  useCommissionReport, useCommissionRates, useUpsertCommissionRate, useUpsertSettlement,
} from '@/features/commission/use-commission'
import { CommissionReportTable } from '@/features/commission/CommissionReportTable'
import { methodLabel } from '@/features/commission/method-labels'

const METHODS = ['havale', 'hizli_havale', 'kripto']

export default function FinanceReportPage() {
  const { data: me } = useMe()
  const role = me?.user.role
  const canWrite = role === 'super_admin' || role === 'tenant_admin'

  const [range, setRange] = useState<DateRange | undefined>()
  const [merchantId, setMerchantId] = useState('')

  const isMerchant = role === 'merchant'
  const { data: merchantsData } = useMerchants(1, 100, undefined, !isMerchant)
  const merchants = merchantsData?.data ?? []

  const from = range?.from ? format(range.from, 'yyyy-MM-dd') : undefined
  const to   = range?.to   ? format(range.to,   'yyyy-MM-dd') : undefined

  const { data, isLoading, error } = useCommissionReport({ from, to, merchantId: merchantId || undefined })

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Gelir / Gider Raporu</h1>
          <p className="text-sm text-muted-foreground">Onaylanmış işlemlere göre günlük komisyon kırılımı ve mutabakat.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          {!isMerchant && (
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
            >
              <option value="">Tüm siteler</option>
              {merchants.map((m) => <option key={m.id} value={m.id}>{m.merchantName}</option>)}
            </select>
          )}
          {canWrite && <SettlementDialog merchants={merchants} />}
          {canWrite && <RatesDialog merchants={merchants} />}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Günlük Raporlar</CardTitle>
          <CardDescription>Site ve gün bazında yatırım / çekim / komisyon.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Yükleniyor...</p>
            : error ? <p className="text-sm text-destructive">Rapor yüklenemedi.</p>
            : <CommissionReportTable rows={data?.data ?? []} settlements={data?.settlements ?? []} />}
        </CardContent>
      </Card>
    </div>
  )
}

function SettlementDialog({ merchants }: { merchants: { id: string; merchantName: string }[] }) {
  const [open, setOpen] = useState(false)
  const [merchantId, setMerchantId] = useState('')
  const [date, setDate] = useState('')
  const [paidToUs, setPaidToUs] = useState('')
  const [paidByUs, setPaidByUs] = useState('')
  const [note, setNote] = useState('')
  const upsert = useUpsertSettlement()

  async function save() {
    if (!merchantId || !date) { toast.error('Site ve tarih zorunlu.'); return }
    try {
      await upsert.mutateAsync({
        merchantId, settlementDate: date,
        paidToUs: Number(paidToUs) || 0, paidByUs: Number(paidByUs) || 0,
        note: note || undefined,
      })
      toast.success('Mutabakat kaydedildi.')
      setOpen(false)
    } catch { toast.error('Kaydedilemedi.') }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Mutabakat Gir</Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Günlük Mutabakat</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Site</Label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
              <option value="">Seçin</option>
              {merchants.map((m) => <option key={m.id} value={m.id}>{m.merchantName}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Tarih</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1"><Label>Bize Ödenen Tutar</Label><Input type="number" step="0.01" value={paidToUs} onChange={(e) => setPaidToUs(e.target.value)} /></div>
          <div className="space-y-1"><Label>Birim Ödediğimiz Tutar</Label><Input type="number" step="0.01" value={paidByUs} onChange={(e) => setPaidByUs(e.target.value)} /></div>
          <div className="space-y-1"><Label>Not</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={upsert.isPending}>{upsert.isPending ? 'Kaydediliyor...' : 'Kaydet'}</Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  )
}

function RatesDialog({ merchants }: { merchants: { id: string; merchantName: string }[] }) {
  const [open, setOpen] = useState(false)
  const [merchantId, setMerchantId] = useState('')
  const { data: ratesData } = useCommissionRates(merchantId || undefined)
  const upsert = useUpsertCommissionRate()
  const [draft, setDraft] = useState<Record<string, { d: string; w: string }>>({})

  const rateFor = (method: string) => {
    if (draft[method]) return draft[method]
    const r = ratesData?.data.find((x) => x.paymentMethod === method)
    return { d: r?.depositRate ?? '0', w: r?.withdrawalRate ?? '0' }
  }
  const setRate = (method: string, k: 'd' | 'w', v: string) =>
    setDraft((p) => ({ ...p, [method]: { ...rateFor(method), [k]: v } }))

  async function save(method: string) {
    if (!merchantId) { toast.error('Önce site seçin.'); return }
    const r = rateFor(method)
    try {
      await upsert.mutateAsync({ merchantId, paymentMethod: method, depositRate: Number(r.d) || 0, withdrawalRate: Number(r.w) || 0 })
      toast.success(`${methodLabel(method)} oranı kaydedildi.`)
    } catch { toast.error('Kaydedilemedi.') }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Komisyon Oranları</Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setDraft({}) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Komisyon Oranları (%)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={merchantId} onChange={(e) => { setMerchantId(e.target.value); setDraft({}) }}>
            <option value="">Site seçin</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.merchantName}</option>)}
          </select>
          {merchantId && METHODS.map((method) => {
            const r = rateFor(method)
            return (
              <div key={method} className="flex items-end gap-2">
                <div className="w-32 pb-2 text-sm">{methodLabel(method)}</div>
                <div className="flex-1 space-y-1"><Label className="text-xs">Yatırım %</Label><Input type="number" step="0.01" value={r.d} onChange={(e) => setRate(method, 'd', e.target.value)} /></div>
                <div className="flex-1 space-y-1"><Label className="text-xs">Çekim %</Label><Input type="number" step="0.01" value={r.w} onChange={(e) => setRate(method, 'w', e.target.value)} /></div>
                <Button size="sm" onClick={() => save(method)} disabled={upsert.isPending}>Kaydet</Button>
              </div>
            )
          })}
        </div>
      </DialogContent>
      </Dialog>
    </>
  )
}
