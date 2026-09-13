/**
 * Komisyon hesabı.
 *
 * İşlem APPROVED'a geçerken o anki oranla hesaplanıp transactions tablosuna snapshot
 * olarak yazılır (commission_rate + commission_amount). Oran sonradan değişse de
 * geçmiş raporlar bozulmaz.
 *
 * Oran tanımlı değilse komisyon 0 yazılır — işlem onayı komisyon yüzünden bloke olmaz.
 */
import { db, merchantCommissionRates, and, eq } from '@panel/db'
import type { Transaction } from '@panel/db'

/** Çekimde yöntem paymentMethod'da ('IBAN'), yatırımda depositMethod'da tutulur. */
export function resolveMethod(tx: Pick<Transaction, 'type' | 'depositMethod' | 'paymentMethod'>): string {
  if (tx.type === 'deposit') return tx.depositMethod ?? 'havale'
  const m = tx.paymentMethod?.toLowerCase()
  if (!m || m === 'iban') return 'havale'
  return m
}

export interface CommissionSnapshot {
  commissionRate:   string
  commissionAmount: string
}

/**
 * İşlem için komisyon oranı ve tutarını hesaplar.
 * Taban tutar: TRY karşılığı varsa o (kripto için dönüştürülmüş), yoksa amount.
 */
export async function calculateCommission(
  tx: Pick<Transaction, 'merchantId' | 'type' | 'amount' | 'amountTry' | 'depositMethod' | 'paymentMethod'>,
): Promise<CommissionSnapshot> {
  const method = resolveMethod(tx)

  const rateRow = await db.query.merchantCommissionRates.findFirst({
    where: and(
      eq(merchantCommissionRates.merchantId, tx.merchantId),
      eq(merchantCommissionRates.paymentMethod, method),
    ),
  })

  const rate = tx.type === 'deposit'
    ? parseFloat(rateRow?.depositRate    ?? '0')
    : parseFloat(rateRow?.withdrawalRate ?? '0')

  if (!rate) return { commissionRate: '0.00', commissionAmount: '0.00' }

  const base   = parseFloat(tx.amountTry ?? tx.amount)
  const amount = Number.isFinite(base) ? (base * rate) / 100 : 0

  return {
    commissionRate:   rate.toFixed(2),
    commissionAmount: amount.toFixed(2),
  }
}
