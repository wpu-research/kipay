'use client'

import * as React from 'react'
import { Label, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

interface StatusItem {
  status: string
  count: number
}

interface StatusDistributionChartProps {
  items: StatusItem[]
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:  'var(--chart-1)',
  APPROVED:   'var(--chart-2)',
  PENDING:    'var(--chart-3)',
  PROCESSING: 'var(--chart-4)',
  REJECTED:   'var(--chart-5)',
  FLAGGED:    'var(--chart-1)',
  CANCELLED:  'var(--chart-2)',
  TIMEOUT:    'var(--chart-3)',
  STARTED:    'var(--chart-4)',
}

export function StatusDistributionChart({ items }: StatusDistributionChartProps) {
  const safeItems = items ?? []
  const total = safeItems.reduce((s, i) => s + i.count, 0)

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        Veri yok
      </div>
    )
  }

  const chartConfig = Object.fromEntries(
    safeItems.map((item) => [
      item.status,
      { label: item.status, color: STATUS_COLORS[item.status] ?? 'var(--chart-5)' },
    ])
  ) satisfies ChartConfig

  const chartData = safeItems.map((item) => ({
    status: item.status,
    count: item.count,
    fill: STATUS_COLORS[item.status] ?? 'var(--chart-5)',
  }))

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[260px]">
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Pie
          data={chartData}
          dataKey="count"
          nameKey="status"
          innerRadius={55}
          strokeWidth={3}
        >
          <Label
            content={({ viewBox }) => {
              if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">
                      {total.toLocaleString('tr-TR')}
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 22} className="fill-muted-foreground text-xs">
                      işlem
                    </tspan>
                  </text>
                )
              }
              return null
            }}
          />
        </Pie>
        <ChartLegend
          content={<ChartLegendContent nameKey="status" />}
          className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/3 [&>*]:justify-center"
        />
      </PieChart>
    </ChartContainer>
  )
}
