import type { PgBoss } from 'pg-boss'
import { db, transactions, eq, and } from '@panel/db'

export async function claimTimeout(
  jobs: Array<{ data: { transactionId: string; type?: 'started' | 'claim' } }>,
  boss: PgBoss,
) {
  const job = jobs[0]
  if (!job) return
  const { transactionId, type } = job.data

  if (type === 'started') {
    // STARTED → TIMEOUT (deposit confirm edilmedi, süresi doldu)
    const [result] = await db
      .update(transactions)
      .set({ status: 'TIMEOUT', callbackStatus: 'pending', updatedAt: new Date() })
      .where(and(
        eq(transactions.id, transactionId),
        eq(transactions.status, 'STARTED'),
        eq(transactions.type, 'deposit'),
      ))
      .returning({ id: transactions.id })

    if (result) {
      console.log(`[claim-timeout] Deposit ${transactionId} TIMEOUT'a geçirildi`)
      await boss.send('callback-retry', { transactionId }, {
        retryLimit:   4,
        retryDelay:   120,
        singletonKey: transactionId,  // 5-4: idempotent enqueue
      })
    } else {
      console.log(`[claim-timeout] Deposit ${transactionId} zaten confirm edilmiş/iptal — atlandı`)
    }
    return
  }

  // Mevcut: PROCESSING → PENDING (claim timeout)
  const [result] = await db
    .update(transactions)
    .set({
      status:         'PENDING',
      claimedBy:      null,
      claimedAt:      null,
      claimExpiresAt: null,
      updatedAt:      new Date(),
    })
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.status, 'PROCESSING'),
      )
    )
    .returning({ id: transactions.id })

  if (result) {
    console.log(`[claim-timeout] İşlem ${transactionId} PENDING'e döndürüldü`)
  } else {
    console.log(`[claim-timeout] İşlem ${transactionId} zaten tamamlanmış/reddedilmiş — atlandı`)
  }
}
