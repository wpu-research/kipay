import { pgTable, uuid, primaryKey } from 'drizzle-orm/pg-core'
import { paymentAccounts } from './payment-accounts'
import { cryptos } from './cryptos'

export const paymentAccountCryptos = pgTable('payment_account_cryptos', {
  paymentAccountId: uuid('payment_account_id').notNull().references(() => paymentAccounts.id, { onDelete: 'cascade' }),
  cryptoId:         uuid('crypto_id').notNull().references(() => cryptos.id),
}, (t) => [
  primaryKey({ columns: [t.paymentAccountId, t.cryptoId] }),
])
