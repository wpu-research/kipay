'use client'
import type { CommissionReportRow, CommissionSettlementRow } from '@panel/types'
import { methodLabel, money } from './method-labels'

interface Group {
  date:         string
  merchantId:   string
  merchantName: string
  rows:         CommissionReportRow[]
}

function groupRows(rows: CommissionReportRow[]): Group[] {
  const map = new Map<string, Group>()
  for (const r of rows) {
    const key = `${r.date}|${r.merchantId}`
    let g = map.get(key)
    if (!g) { g = { date: r.date, merchantId: r.merchantId, merchantName: r.merchantName, rows: [] }; map.set(key, g) }
    g.rows.push(r)
  }
  return [...map.values()]
}

export function CommissionReportTable({
  rows, settlements,
}: {
  rows: CommissionReportRow[]
  settlements: CommissionSettlementRow[]
}) {
  const groups = groupRows(rows)
  if (!groups.length) return <p className="text-sm text-muted-foreground">Seçilen aralıkta veri bulunamadı.</p>

  const settlementFor = (date: string, merchantId: string) =>
    settlements.find(s => s.settlementDate === date && s.merchantId === merchantId)

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const totDep = g.rows.reduce((s, r) => s + Number(r.depositAmount), 0)
        const totDepC = g.rows.reduce((s, r) => s + Number(r.depositCommission), 0)
        const totWd = g.rows.reduce((s, r) => s + Number(r.withdrawalAmount), 0)
        const totWdC = g.rows.reduce((s, r) => s + Number(r.withdrawalCommission), 0)
        const totComm = totDepC + totWdC
        const st = settlementFor(g.date, g.merchantId)

        return (
          <div key={`${g.date}-${g.merchantId}`} className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
              <span className="font-medium">{g.merchantName}</span>
              <span className="font-mono text-xs text-muted-foreground">{g.date}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Yöntem</th>
                    <th className="px-3 py-2 font-medium">YATIRIM</th>
                    <th className="px-3 py-2 font-medium">YATIRIM KOM.</th>
                    <th className="px-3 py-2 font-medium">ÇEKİM</th>
                    <th className="px-3 py-2 font-medium">ÇEKİM KOM.</th>
                    <th className="px-3 py-2 font-medium">KOM. TOPLAMI</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {g.rows.map((r) => (
                    <tr key={r.method} className="border-b text-right last:border-0">
                      <td className="px-3 py-2 text-left">{methodLabel(r.method)}</td>
                      <td className="px-3 py-2">{money(r.depositAmount)}</td>
                      <td className="px-3 py-2">{money(r.depositCommission)}</td>
                      <td className="px-3 py-2">{money(r.withdrawalAmount)}</td>
                      <td className="px-3 py-2">{money(r.withdrawalCommission)}</td>
                      <td className="px-3 py-2 font-medium">{money(Number(r.depositCommission) + Number(r.withdrawalCommission))}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 text-right font-semibold">
                    <td className="px-3 py-2 text-left">TOPLAM</td>
                    <td className="px-3 py-2">{money(totDep)}</td>
                    <td className="px-3 py-2">{money(totDepC)}</td>
                    <td className="px-3 py-2">{money(totWd)}</td>
                    <td className="px-3 py-2">{money(totWdC)}</td>
                    <td className="px-3 py-2">{money(totComm)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
              <div className="space-y-1 text-muted-foreground">
                <div>Bize Ödenen Tutar: <span className="font-medium text-foreground tabular-nums">{st ? money(st.paidToUs) : '—'}</span></div>
                <div>Birim Ödediğimiz Tutar: <span className="font-medium text-foreground tabular-nums">{st ? money(st.paidByUs) : '—'}</span></div>
              </div>
              <div className="rounded-md bg-primary/10 px-4 py-2 text-right">
                <div className="text-xs text-muted-foreground">Komisyon Toplamı</div>
                <div className="text-lg font-bold tabular-nums">{money(totComm)}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
