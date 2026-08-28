import { db, merchants, users, notifications, sql, and, eq } from '@panel/db'
import { AppError } from '../../errors/app-error.js'
import { exchangeRateService } from '../exchange-rates/exchange-rate.service.js'

export interface RouteResult {
  paymentAccountId: string
  accountNumber: string
  accountName: string
  bankName?: string | null
}

// Drizzle transaction object has the same execute interface as db
type TxClient = { execute: typeof db.execute }

function isCryptoCurrency(currency: string): boolean {
  return currency.toUpperCase() === 'CRYPTO'
}

async function lockAndUpdateAccount(
  client: TxClient,
  tenantId: string,
  environment: string,
  amount: string,
  currency: string,
  ownedByUserId?: string,
): Promise<{ id: string; account_number: string; name: string; bank_name: string | null }> {
  const crypto = isCryptoCurrency(currency)

  const rows = crypto
    ? await client.execute(sql`
        SELECT pa.id, pa.account_number, pa.name, NULL::text AS bank_name
        FROM payment_accounts pa
        WHERE pa.tenant_id = ${tenantId}
          AND pa.status = 'active'
          AND pa.environment = ${environment}::payment_account_environment
          AND pa.type = 'crypto'
          AND pa.daily_used + ${amount}::numeric <= pa.daily_limit
          ${ownedByUserId ? sql`AND pa.owned_by_user_id = ${ownedByUserId}::uuid` : sql``}
        ORDER BY (pa.daily_used::float8 / NULLIF(pa.daily_limit::float8, 0)) ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `)
    : await client.execute(sql`
        SELECT pa.id, pa.account_number, pa.name, b.name AS bank_name
        FROM payment_accounts pa
        JOIN banks b ON b.id = pa.bank_id
        WHERE pa.tenant_id = ${tenantId}
          AND pa.status = 'active'
          AND pa.environment = ${environment}::payment_account_environment
          AND pa.type = 'bank'
          AND pa.daily_used + ${amount}::numeric <= pa.daily_limit
          ${ownedByUserId ? sql`AND pa.owned_by_user_id = ${ownedByUserId}::uuid` : sql``}
        ORDER BY (pa.daily_used::float8 / NULLIF(pa.daily_limit::float8, 0)) ASC
        LIMIT 1
        FOR UPDATE OF pa SKIP LOCKED
      `)

  const account = (rows as unknown as { id: string; account_number: string; name: string; bank_name: string | null }[])[0]
  if (!account) {
    throw new AppError('NO_AVAILABLE_ACCOUNT', 'Uygun ödeme hesabı bulunamadı.', 422)
  }

  await client.execute(sql`
    UPDATE payment_accounts
    SET daily_used = daily_used + ${amount}::numeric,
        updated_at = NOW()
    WHERE id = ${account.id}
  `)

  return account
}


export async function validateRouting(params: {
  tenantId:   string
  merchantId: string
  currency:   string
}) {
  const { tenantId, merchantId, currency } = params

  const merchant = await db.query.merchants.findFirst({
    where: and(eq(merchants.id, merchantId), eq(merchants.tenantId, tenantId)),
  })
  if (!merchant) throw new AppError('NOT_FOUND', 'Merchant bulunamadı.', 404)

  // Exchange rate tazelik kontrolü — yalnızca kripto işlemlerde gerekli
  if (isCryptoCurrency(currency)) {
    const isStale = await exchangeRateService.isStale()
    if (isStale) {
      const superAdmins = await db.query.users.findMany({
        where: and(eq(users.role, 'super_admin'), eq(users.status, 'active')),
        columns: { id: true, tenantId: true },
      })
      if (superAdmins.length > 0) {
        try {
          await db.insert(notifications).values(
            superAdmins.map((u) => ({
              tenantId:      u.tenantId,
              userId:        u.id,
              transactionId: null,
              type:          'system.stale_exchange_rate',
              payload:       { type: 'system.stale_exchange_rate' as const, message: 'Döviz kuru 15 dakikadan eski.' },
              isRead:        false,
            }))
          )
        } catch (notifErr) {
          console.error('[routing-engine] Stale-rate bildirimi gönderilemedi:', notifErr)
        }
      }
      throw new AppError('STALE_EXCHANGE_RATE', 'Güncel kur bilgisi bulunamadı (15 dakika eşiği aşıldı).', 422)
    }
  }

  return {
    merchant,
    environment: merchant.isSandbox ? 'sandbox' : 'production',
  }
}

// Standard usage (creates its own transaction)
export async function selectPaymentAccount(params: {
  tenantId:   string
  merchantId: string
  amount:     string
  currency:   string
}): Promise<RouteResult> {
  const { tenantId, merchantId, amount, currency } = params
  const { environment } = await validateRouting({ tenantId, merchantId, currency })

  const selected = await db.transaction(async (tx) =>
    lockAndUpdateAccount(tx, tenantId, environment, amount, currency)
  )

  return { paymentAccountId: selected.id, accountNumber: selected.account_number, accountName: selected.name }
}

// Atomic usage: caller provides outer tx so daily_used + transaction insert are in one transaction
export async function selectPaymentAccountInTx(
  tx: TxClient,
  params: { tenantId: string; environment: string; amount: string; currency: string; ownedByUserId?: string },
): Promise<RouteResult & { bankName: string | null }> {
  const { tenantId, environment, amount, currency, ownedByUserId } = params
  const selected = await lockAndUpdateAccount(tx, tenantId, environment, amount, currency, ownedByUserId)
  return {
    paymentAccountId: selected.id,
    accountNumber:    selected.account_number,
    accountName:      selected.name,
    bankName:         selected.bank_name,
  }
}
