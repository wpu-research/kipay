import { db, exportJobs, lte, inArray } from '@panel/db'
import * as fs from 'node:fs'

export async function cleanupExports(): Promise<void> {
  const now = new Date()

  // Süresi dolmuş job kayıtlarını bul
  const expired = await db
    .select({ id: exportJobs.id, filePath: exportJobs.filePath })
    .from(exportJobs)
    .where(lte(exportJobs.expiresAt, now))

  if (expired.length === 0) return

  // Dosyaları sil
  for (const job of expired) {
    if (job.filePath) {
      try {
        fs.unlinkSync(job.filePath)
      } catch {
        // Dosya zaten silinmiş veya hiç oluşturulmamış — devam et
      }
    }
  }

  // DB kayıtlarını sil
  const ids = expired.map(j => j.id)
  await db.delete(exportJobs).where(inArray(exportJobs.id, ids))

  console.log(`[cleanup-exports] ${ids.length} süresi dolmuş export job temizlendi`)
}
