import type { PgBoss } from 'pg-boss'
import { db, transactions, eq, and, inArray } from '@panel/db'

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
      return
    }

    // Havale: kullanıcı süre içinde "Yatırdım" (playerConfirmed) demediyse otomatik REJECTED.
    // Onaylanmış (playerConfirmed=true) veya terminal işlemler etkilenmez.
    const [autoRejected] = await db
      .update(transactions)
      .set({
        status:         'REJECTED',
        note:           'Otomatik red: kullanıcı ödeme onayı (Yatırdım) vermedi — süre doldu.',
        callbackStatus: 'pending',
        updatedAt:      new Date(),
      })
      .where(and(
        eq(transactions.id, transactionId),
        eq(transactions.type, 'deposit'),
        eq(transactions.playerConfirmed, false),
        inArray(transactions.status, ['PENDING', 'PROCESSING']),
      ))
      .returning({ id: transactions.id })

    if (autoRejected) {
      console.log(`[claim-timeout] Deposit ${transactionId} otomatik REJECTED (onay verilmedi)`)
      await boss.send('callback-retry', { transactionId }, {
        retryLimit:   4,
        retryDelay:   120,
        singletonKey: transactionId,
      })
    } else {
      console.log(`[claim-timeout] Deposit ${transactionId} zaten confirm edilmiş/terminal — atlandı`)
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
