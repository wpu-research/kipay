'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ExchangeRateItem } from '@panel/types'
import { useExchangeRateHistory } from './use-exchange-rates'

export function ExchangeRateHistory() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useExchangeRateHistory({ page })
  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0
  const limit = data?.meta.limit ?? 20
  const totalPages = Math.ceil(total / limit) || 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kur Geçmişi</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}

        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Kur kaydı bulunamadı.</p>
        )}

        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">Kaynak Para</th>
                    <th className="py-2 text-left font-medium">Hedef Para</th>
                    <th className="py-2 text-right font-medium">Kur</th>
                    <th className="py-2 text-left font-medium">Kaynak</th>
                    <th className="py-2 text-right font-medium">Tarih</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: ExchangeRateItem) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2">{r.fromCurrency}</td>
                      <td className="py-2">{r.toCurrency}</td>
                      <td className="py-2 text-right font-mono">{r.rate}</td>
                      <td className="py-2">{r.source}</td>
                      <td className="py-2 text-right text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString('tr-TR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-muted-foreground">
                Sayfa {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  &lt; Önceki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Sonraki &gt;
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
