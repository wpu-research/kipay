'use client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ExchangeRateItem } from '@panel/types'

const SOURCE_LABELS: Record<string, string> = {
  manual:          'Manuel',
  coinmarketcap:   'CoinMarketCap',
  binance:         'Binance',
  binance_tr:      'Binance TR',
  coingecko:       'CoinGecko',
}

interface Props {
  rates:     ExchangeRateItem[]
  isLoading: boolean
  isError:   boolean
}

export function ExchangeRateTable({ rates, isLoading, isError }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Güncel Döviz Kurları</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Yükleniyor...</p>}
        {isError   && <p className="text-sm text-destructive">Kurlar yüklenemedi.</p>}
        {!isLoading && !isError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Çift</th>
                  <th className="pb-2 pr-4">Kur</th>
                  <th className="pb-2 pr-4">Kaynak</th>
                  <th className="pb-2 pr-4">Güncellenme</th>
                </tr>
              </thead>
              <tbody>
                {rates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      Henüz kur kaydı yok.
                    </td>
                  </tr>
                )}
                {rates.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">
                      {r.fromCurrency}/{r.toCurrency}
                    </td>
                    <td className="py-2 pr-4 font-mono">
                      {parseFloat(r.rate).toLocaleString('tr-TR', { minimumFractionDigits: 4 })}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={r.source === 'manual' ? 'secondary' : 'default'}>
                        {SOURCE_LABELS[r.source] ?? r.source}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground text-xs">
                      {new Date(r.fetchedAt).toLocaleString('tr-TR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
