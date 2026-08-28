'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useQueueStats } from '@/features/system/use-system'
import { useMe } from '@/features/auth/use-me'
import type { QueueJobStats } from '@panel/types'

const CALLBACK_STATS = [
  {
    key: 'pending' as const,
    label: 'Bekleyen',
    sublabel: 'pending',
    desc: 'Job kuyruğa alındı, henüz işlenmedi',
    color: (v: number) => v > 0 ? 'text-yellow-600' : '',
  },
  {
    key: 'sent' as const,
    label: 'Gönderildi',
    sublabel: 'sent',
    desc: 'Webhook başarıyla teslim edildi',
    color: () => 'text-green-600',
  },
  {
    key: 'failed' as const,
    label: 'Başarısız',
    sublabel: 'failed',
    desc: 'Tüm denemeler tükendi veya config eksik',
    color: (v: number) => v > 0 ? 'text-orange-600' : '',
  },
  {
    key: 'dead' as const,
    label: 'Ölü',
    sublabel: 'dead',
    desc: 'Manuel müdahale gerekiyor',
    color: (v: number) => v > 0 ? 'text-red-600' : '',
  },
]

function CallbackCard({
  summary,
  isLoading,
  error,
}: {
  summary: { pending: number; sent: number; failed: number; dead: number } | undefined
  isLoading: boolean
  error: unknown
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Callback Durumu</CardTitle>
          <CardDescription>Anlık callback kuyruğu özeti</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/system/callbacks">Logları Gör</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Callback durumu alınamadı.</p>
        ) : summary ? (
          <div className="grid grid-cols-4 gap-3">
            {CALLBACK_STATS.map(({ key, label, sublabel, desc, color }) => (
              <Card key={key}>
                <CardHeader className="pb-1">
                  <CardDescription>
                    {label} <span className="font-mono">({sublabel})</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold tabular-nums ${color(summary[key])}`}>
                    {summary[key]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

const JOB_DESCRIPTIONS: Record<string, string> = {
  'callback-retry':    "Başarısız callback'leri yeniden gönderir",
  'callback-recovery': "Takılı kalan callback'leri kurtarır (5 dk'da bir)",
  'claim-timeout':     "Zaman aşımına uğrayan claim'leri iptal eder",
  'daily-limit-reset': 'Günlük ödeme limitlerini sıfırlar (gece 00:00)',
  'rate-sync':         "Döviz kurlarını senkronize eder (10 dk'da bir)",
  'report-export':     'Rapor dışa aktarma işlemlerini işler',
  'cleanup-exports':   'Eski dışa aktarma dosyalarını temizler (02:00)',
  'nonce-cleanup':     'Süresi dolmuş nonce kayıtlarını siler (saatlik)',
}

function QueueTable({
  queues,
  isLoading,
  error,
}: {
  queues: QueueJobStats[] | undefined
  isLoading: boolean
  error: unknown
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Kuyrukları</CardTitle>
        <CardDescription>
          Tamamlanan job&apos;lar pg-boss tarafından arşive taşınır — sayılar kısa dönem verisini yansıtır.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-destructive">Kuyruk istatistikleri alınamadı.</p>
        ) : queues && queues.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead className="text-right text-green-600">Tamamlanan</TableHead>
                <TableHead className="text-right text-red-600">Başarısız</TableHead>
                <TableHead className="text-right text-blue-600">Aktif</TableHead>
                <TableHead className="text-right text-yellow-600">Bekleyen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queues.map((job) => (
                <TableRow key={job.name}>
                  <TableCell>
                    <p className="font-mono text-sm">{job.name}</p>
                    {JOB_DESCRIPTIONS[job.name] && (
                      <p className="text-xs text-muted-foreground">{JOB_DESCRIPTIONS[job.name]}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-600">{job.completed}</TableCell>
                  <TableCell className="text-right font-medium text-red-600">{job.failed}</TableCell>
                  <TableCell className="text-right font-medium text-blue-600">{job.active}</TableCell>
                  <TableCell className="text-right font-medium text-yellow-600">{job.waiting}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Kuyruk verisi bulunamadı.</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function SystemPage() {
  const { data: meData } = useMe()
  const role = meData?.user?.role
  const router = useRouter()

  useEffect(() => {
    if (role && role !== 'super_admin') {
      router.replace('/transactions')
    }
  }, [role, router])

  const { data: queueStats, isLoading: queueLoading, error: queueError } = useQueueStats()

  if (!role || role !== 'super_admin') return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sistem</h1>
        <p className="text-sm text-muted-foreground">Altyapı durumu ve iş kuyruğu izleme</p>
      </div>

      <CallbackCard
        summary={queueStats?.callbackSummary}
        isLoading={queueLoading}
        error={queueError}
      />

      <QueueTable
        queues={queueStats?.queues}
        isLoading={queueLoading}
        error={queueError}
      />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings">Veri Sıfırlama</Link>
        </Button>
      </div>
    </div>
  )
}
