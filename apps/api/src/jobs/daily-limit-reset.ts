import { db, paymentAccounts, transactions, eq, and, gt, not, inArray } from '@panel/db'

export async function dailyLimitReset(_job: unknown) {
  const now = new Date()

  // Aktif claim'i OLAN hesapları tespit et (PROCESSING + claim süresi dolmamış)
  const activeClaimSubquery = db
    .select({ paymentAccountId: transactions.paymentAccountId })
    .from(transactions)
    .where(
      and(
        eq(transactions.status, 'PROCESSING'),
        gt(transactions.claimExpiresAt, now)
      )
    )

  // Aktif claim'i olmayan aktif hesapları sıfırla
  await db
    .update(paymentAccounts)
    .set({ dailyUsed: '0', lastResetAt: now })
    .where(
      and(
        eq(paymentAccounts.status, 'active'),
        not(inArray(paymentAccounts.id, activeClaimSubquery))
      )
    )
}
