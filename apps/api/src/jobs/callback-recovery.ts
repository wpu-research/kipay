import type { PgBoss } from 'pg-boss'
import { db, transactions, eq, and, lte } from '@panel/db'

// 4-4/5-2: Transactional outbox recovery — callbackStatus='pending' olan işlemleri yeniden kuyruğa alır.
// boss.send() ve DB commit arasında sunucu çökmesi olursa, bu job callback'i yeniden tetikler.
// singletonKey garantisi sayesinde zaten kuyruktaki bir job için duplicate oluşmaz.

const PENDING_GRACE_SECONDS = 180  // 3 dakika — normal boss.send süresine tolerans

export async function callbackRecovery(_job: unknown, boss: PgBoss): Promise<void> {
  const cutoff = new Date(Date.now() - PENDING_GRACE_SECONDS * 1000)

  // callbackStatus='pending' ve updatedAt > PENDING_GRACE_SECONDS önce olan işlemleri bul
  const stalled = await db.query.transactions.findMany({
    where: and(
      eq(transactions.callbackStatus, 'pending'),
      lte(transactions.updatedAt, cutoff),
    ),
    columns: { id: true },
    limit: 100,  // tek çalışmada fazla iş üstlenme
  })

  if (stalled.length === 0) return

  let requeued = 0
  for (const tx of stalled) {
    try {
      // Recovery için singletonKey kullanmıyoruz — recovery zaten singletonKey'in
      // tutulduğu (stuck active job) durumları için var. Worker başında idempotency
      // kontrolü duplicate callback gönderimini önler.
      const jobId = await boss.send('callback-retry', { transactionId: tx.id }, {
        retryLimit:      4,
        retryDelay:      120,
        expireInSeconds: 60,
      })
      if (jobId) requeued++
      else console.warn(`[callback-recovery] ${tx.id} kuyruğa alınamadı (singleton çakışması olabilir)`)
    } catch (err) {
      console.error(`[callback-recovery] ${tx.id} yeniden kuyruğa alınamadı:`, err)
    }
  }

  if (requeued > 0) {
    console.info(`[callback-recovery] ${requeued} işlem callback kuyruğuna yeniden alındı`)
  }
}
