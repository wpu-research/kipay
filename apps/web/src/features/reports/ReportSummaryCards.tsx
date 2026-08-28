import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { TransactionReport } from '@panel/types'

interface ReportSummaryCardsProps {
  data: TransactionReport
}

function fmt(value: string): string {
  const n = parseFloat(value)
  if (isNaN(n)) return value
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

const cards = [
  {
    key: 'totalAmount' as const,
    title: 'Toplam Tutar',
    render: (data: TransactionReport) =>
      `${fmt(data.totalAmount)}${data.currency ? ` ${data.currency}` : ''}`,
  },
  {
    key: 'transactionCount' as const,
    title: 'İşlem Sayısı',
    render: (data: TransactionReport) =>
      data.transactionCount.toLocaleString('tr-TR'),
  },
  {
    key: 'averageAmount' as const,
    title: 'Ortalama Tutar',
    render: (data: TransactionReport) =>
      `${fmt(data.averageAmount)}${data.currency ? ` ${data.currency}` : ''}`,
  },
]

export function ReportSummaryCards({ data }: ReportSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {card.render(data)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
