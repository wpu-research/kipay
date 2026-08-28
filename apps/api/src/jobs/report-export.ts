import { db, exportJobs, transactions, eq, and, gte, lte, count } from '@panel/db'
import * as XLSX from 'xlsx'
import * as fs from 'node:fs'
import * as path from 'node:path'

const EXPORT_DIR = '/tmp/reports-export'
const MAX_ROWS = 100_000  // 7-3: OOM önlemi — bu sınırı aşan sorgular reddedilir

export async function reportExport(job: unknown): Promise<void> {
  const { jobId } = (job as { data: { jobId: string } }).data

  // 1. Job'ı processing yap
  await db.update(exportJobs).set({ status: 'processing' }).where(eq(exportJobs.id, jobId))

  try {
    // 2. Job detaylarını oku
    const [exportJob] = await db.select().from(exportJobs).where(eq(exportJobs.id, jobId))
    if (!exportJob) throw new Error(`Export job bulunamadı: ${jobId}`)

    const filters = exportJob.filters as Record<string, string>

    // 3. Transaction verilerini çek
    const conditions = buildExportConditions(exportJob.role, exportJob.tenantId, filters)
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // 7-3: OOM önlemi — satır sayısını önceden kontrol et
    const [{ value: rowCount }] = await db
      .select({ value: count() })
      .from(transactions)
      .where(whereClause)
    if (rowCount > MAX_ROWS) {
      throw new Error(
        `Export isteği çok fazla satır içeriyor (${rowCount.toLocaleString()} satır, limit: ${MAX_ROWS.toLocaleString()}). ` +
        `Lütfen tarih aralığını veya filtreleri daraltın.`
      )
    }

    const rows = await db
      .select({
        id:        transactions.id,
        tenantId:  transactions.tenantId,
        merchantId: transactions.merchantId,
        amount:    transactions.amount,
        currency:  transactions.currency,
        status:    transactions.status,
        createdAt: transactions.createdAt,
        resolvedAt: transactions.resolvedAt,
      })
      .from(transactions)
      .where(whereClause)
      .orderBy(transactions.createdAt)

    // 4. Dosya oluştur
    fs.mkdirSync(EXPORT_DIR, { recursive: true })
    const ext = exportJob.format === 'xlsx' ? 'xlsx' : 'csv'
    const filePath = path.join(EXPORT_DIR, `${jobId}.${ext}`)

    const worksheetData = [
      ['ID', 'TenantID', 'MerchantID', 'Amount', 'Currency', 'Status', 'CreatedAt', 'ResolvedAt'],
      ...rows.map(r => [
        r.id, r.tenantId, r.merchantId ?? '', r.amount, r.currency ?? '',
        r.status, r.createdAt.toISOString(), r.resolvedAt?.toISOString() ?? '',
      ]),
    ]

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(worksheetData)
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions')

    if (exportJob.format === 'xlsx') {
      XLSX.writeFile(wb, filePath)
    } else {
      const csv = XLSX.utils.sheet_to_csv(ws)
      fs.writeFileSync(filePath, csv, 'utf8')
    }

    // 5. Tamamlandı — 24 saat geçerli
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await db.update(exportJobs)
      .set({ status: 'completed', filePath, expiresAt })
      .where(eq(exportJobs.id, jobId))

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db.update(exportJobs)
      .set({ status: 'failed', errorMessage: msg })
      .where(eq(exportJobs.id, jobId))
    throw err // pg-boss retry için
  }
}

function buildExportConditions(role: string, tenantId: string | null, filters: Record<string, string>) {
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
  const parseFrom = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T00:00:00.000Z') : new Date(v)
  const parseTo   = (v: string) => DATE_ONLY.test(v) ? new Date(v + 'T23:59:59.999Z') : new Date(v)

  const conds = []
  if (role !== 'super_admin' && tenantId) conds.push(eq(transactions.tenantId, tenantId))
  if (role === 'super_admin' && filters.tenantId) conds.push(eq(transactions.tenantId, filters.tenantId))
  if (filters.merchantId) conds.push(eq(transactions.merchantId, filters.merchantId))
  if (filters.status) conds.push(eq(transactions.status, filters.status as any))
  if (filters.from) conds.push(gte(transactions.createdAt, parseFrom(filters.from)))
  if (filters.to) conds.push(lte(transactions.createdAt, parseTo(filters.to)))
  return conds
}
