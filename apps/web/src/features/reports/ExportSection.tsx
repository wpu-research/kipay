'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStartExport, useExportJob } from './use-reports'

export function ExportSection() {
  const [format, setFormat]   = useState<'csv' | 'xlsx'>('csv')
  const [jobId,  setJobId]    = useState<string | null>(null)
  const [error,  setError]    = useState('')

  const startExport = useStartExport()
  const { data: jobStatus }   = useExportJob(jobId)

  async function handleStart() {
    setError('')
    try {
      const result = await startExport.mutateAsync({ format })
      setJobId(result.jobId)
    } catch {
      setError('Export başlatılamadı.')
    }
  }

  function handleReset() {
    setJobId(null)
    setError('')
    startExport.reset()
  }

  const status = jobStatus?.status

  return (
    <Card>
      <CardHeader>
        <CardTitle>Veri Dışa Aktar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!jobId && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Format</label>
              <Select value={format} onValueChange={(v) => setFormat(v as 'csv' | 'xlsx')}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleStart}
              disabled={startExport.isPending}
            >
              {startExport.isPending ? 'Başlatılıyor...' : 'Export Başlat'}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {jobId && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Durum:</span>
              <StatusBadge status={status} />
            </div>

            {status === 'completed' && jobStatus?.downloadUrl && (
              <a
                href={jobStatus.downloadUrl}
                download
                className="inline-block"
              >
                <Button variant="outline">
                  İndir ({format.toUpperCase()})
                </Button>
              </a>
            )}

            {(status === 'completed' || status === 'failed') && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Yeni Export
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending:    { label: 'Bekleniyor',    className: 'text-yellow-600' },
    processing: { label: 'İşleniyor...',  className: 'text-blue-600' },
    completed:  { label: 'Tamamlandı',   className: 'text-green-600' },
    failed:     { label: 'Başarısız',    className: 'text-red-600' },
  }
  const info = status ? (map[status] ?? { label: status, className: '' }) : { label: '—', className: '' }
  return <span className={`text-sm font-medium ${info.className}`}>{info.label}</span>
}
