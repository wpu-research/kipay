'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { TransactionReport } from '@panel/types'

interface TransactionVolumeChartProps {
  data: TransactionReport
}

const chartConfig = {
  count: {
    label: 'İşlem',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

export function TransactionVolumeChart({ data }: TransactionVolumeChartProps) {
  const buckets = data?.dailyBuckets ?? []

  if (buckets.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Seçili aralıkta işlem bulunmuyor.
      </div>
    )
  }

  const chartData = buckets.map((b) => ({
    date: b.date,
    count: b.count,
  }))

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
      <BarChart data={chartData} margin={{ left: 0, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis tickLine={false} axisLine={false} width={32} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value: string) => value}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
