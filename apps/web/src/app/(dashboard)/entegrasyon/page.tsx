'use client'

import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useMe } from '@/features/auth/use-me'
import { useCommissionReport } from '@/features/commission/use-commission'
import { money } from '@/features/commission/method-labels'

export default function IntegrationPage() {
  const { data: me } = useMe()
  const merchantId = me?.user.merchantId ?? null

  const { data: report } = useCommissionReport({})
  const rows = report?.data ?? []
  const totDeposit    = rows.reduce((s, r) => s + Number(r.depositAmount), 0)
  const totWithdrawal = rows.reduce((s, r) => s + Number(r.withdrawalAmount), 0)
  const totCommission = rows.reduce((s, r) => s + Number(r.depositCommission) + Number(r.withdrawalCommission), 0)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const widgetUrl = merchantId ? `${origin}/odeme/${merchantId}` : ''
  const embed = merchantId
    ? `<iframe src="${widgetUrl}?page=deposit" style="width:100%;max-width:480px;height:640px;border:0;border-radius:16px" title="Ödeme"></iframe>`
    : ''

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} kopyalandı.`)).catch(() => toast.error('Kopyalanamadı.'))
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Widget & Entegrasyon</h1>
        <p className="text-sm text-muted-foreground">Ödeme sayfanızın bağlantısı, embed kodu ve özet.</p>
      </div>

      {/* Özet */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Toplam Yatırım" value={totDeposit} />
        <SummaryCard label="Toplam Çekim" value={totWithdrawal} />
        <SummaryCard label="Toplam Komisyon" value={totCommission} />
      </div>

      {!merchantId ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Bu hesap bir siteye bağlı değil.</CardContent></Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Ödeme Sayfası</CardTitle>
            <CardDescription>Bu bağlantıyı müşterilerinize verin veya sitenize gömün.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Ödeme Sayfası Linki" value={widgetUrl} onCopy={() => copy(widgetUrl, 'Link')} />
            <Field label="Embed (iframe) Kodu" value={embed} onCopy={() => copy(embed, 'Embed kodu')} multiline />
            <div>
              <Button variant="outline" size="sm" onClick={() => window.open(widgetUrl, '_blank')}>Sayfayı Önizle</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-lg font-bold tabular-nums">{money(value)} <span className="text-xs font-normal text-muted-foreground">TRY</span></div>
      </CardContent>
    </Card>
  )
}

function Field({ label, value, onCopy, multiline }: { label: string; value: string; onCopy: () => void; multiline?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onCopy}>Kopyala</Button>
      </div>
      {multiline
        ? <textarea readOnly value={value} className="w-full rounded-md border bg-muted/30 p-2 font-mono text-xs" rows={3} />
        : <input readOnly value={value} className="w-full rounded-md border bg-muted/30 p-2 font-mono text-xs" />}
    </div>
  )
}
