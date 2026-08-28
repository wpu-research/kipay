import { relations } from 'drizzle-orm'
import { tenants } from './tenants'
import { users } from './users'
import { sessions } from './sessions'
import { merchants } from './merchants'
import { merchantApiKeys } from './merchant-api-keys'
import { merchantIpWhitelist } from './merchant-ip-whitelist'
import { paymentProviders } from './payment-providers'
import { paymentProviderCategories } from './payment-provider-categories'
import { paymentAccounts } from './payment-accounts'
import { banks } from './banks'
import { cryptos } from './cryptos'
import { paymentAccountCryptos } from './payment-account-cryptos'
import { transactions } from './transactions'
import { notifications } from './notifications'
import { transactionComments } from './transaction-comments'
import { callbackLogs } from './callback-logs'
import { blockedPlayers } from './blocked-players'
import { warningRules, warnings } from './warning-rules'

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users:    many(users),
  merchants: many(merchants),
}))

export const merchantsRelations = relations(merchants, ({ one, many }) => ({
  tenant:     one(tenants, {
    fields: [merchants.tenantId],
    references: [tenants.id],
  }),
  users:      many(users),
  apiKeys:    many(merchantApiKeys),
  ipWhitelist: many(merchantIpWhitelist),
}))

export const merchantApiKeysRelations = relations(merchantApiKeys, ({ one }) => ({
  merchant: one(merchants, { fields: [merchantApiKeys.merchantId], references: [merchants.id] }),
  tenant:   one(tenants,   { fields: [merchantApiKeys.tenantId],   references: [tenants.id] }),
}))

export const merchantIpWhitelistRelations = relations(merchantIpWhitelist, ({ one }) => ({
  merchant: one(merchants, { fields: [merchantIpWhitelist.merchantId], references: [merchants.id] }),
  tenant:   one(tenants,   { fields: [merchantIpWhitelist.tenantId],   references: [tenants.id] }),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant:   one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  merchant: one(merchants, {
    fields: [users.merchantId],
    references: [merchants.id],
  }),
  sessions: many(sessions),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const paymentProvidersRelations = relations(paymentProviders, ({ one }) => ({
  tenant: one(tenants, { fields: [paymentProviders.tenantId], references: [tenants.id] }),
}))

export const paymentProviderCategoriesRelations = relations(paymentProviderCategories, ({ one }) => ({
  tenant: one(tenants, { fields: [paymentProviderCategories.tenantId], references: [tenants.id] }),
}))

export const paymentAccountsRelations = relations(paymentAccounts, ({ one, many }) => ({
  tenant:       one(tenants, { fields: [paymentAccounts.tenantId], references: [tenants.id] }),
  bank:         one(banks,   { fields: [paymentAccounts.bankId],   references: [banks.id] }),
  cryptos:      many(paymentAccountCryptos),
  transactions: many(transactions),
}))

export const banksRelations = relations(banks, ({ many }) => ({
  paymentAccounts: many(paymentAccounts),
}))

export const cryptosRelations = relations(cryptos, ({ many }) => ({
  paymentAccountCryptos: many(paymentAccountCryptos),
}))

export const paymentAccountCryptosRelations = relations(paymentAccountCryptos, ({ one }) => ({
  paymentAccount: one(paymentAccounts, { fields: [paymentAccountCryptos.paymentAccountId], references: [paymentAccounts.id] }),
  crypto:         one(cryptos,         { fields: [paymentAccountCryptos.cryptoId],         references: [cryptos.id] }),
}))

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  tenant:         one(tenants,         { fields: [transactions.tenantId],         references: [tenants.id] }),
  merchant:       one(merchants,       { fields: [transactions.merchantId],       references: [merchants.id] }),
  paymentAccount: one(paymentAccounts, { fields: [transactions.paymentAccountId], references: [paymentAccounts.id] }),
  claimedByUser:  one(users,           { fields: [transactions.claimedBy],        references: [users.id] }),
  resolvedByUser: one(users,           { fields: [transactions.resolvedBy],       references: [users.id] }),
  notifications:  many(notifications),
  comments:       many(transactionComments),
  callbackLogs:   many(callbackLogs),
}))

export const callbackLogsRelations = relations(callbackLogs, ({ one }) => ({
  transaction: one(transactions, { fields: [callbackLogs.transactionId], references: [transactions.id] }),
}))

export const transactionCommentsRelations = relations(transactionComments, ({ one }) => ({
  transaction: one(transactions, { fields: [transactionComments.transactionId], references: [transactions.id] }),
  tenant:      one(tenants,      { fields: [transactionComments.tenantId],      references: [tenants.id] }),
  user:        one(users,        { fields: [transactionComments.userId],        references: [users.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant:      one(tenants,      { fields: [notifications.tenantId],      references: [tenants.id] }),
  user:        one(users,        { fields: [notifications.userId],        references: [users.id] }),
  transaction: one(transactions, { fields: [notifications.transactionId], references: [transactions.id] }),
}))

export const blockedPlayersRelations = relations(blockedPlayers, ({ one }) => ({
  tenant:   one(tenants,   { fields: [blockedPlayers.tenantId],   references: [tenants.id] }),
  merchant: one(merchants, { fields: [blockedPlayers.merchantId], references: [merchants.id] }),
}))

export const warningRulesRelations = relations(warningRules, ({ one, many }) => ({
  tenant:   one(tenants,   { fields: [warningRules.tenantId],   references: [tenants.id] }),
  merchant: one(merchants, { fields: [warningRules.merchantId], references: [merchants.id] }),
  warnings: many(warnings),
}))

export const warningsRelations = relations(warnings, ({ one }) => ({
  tenant:      one(tenants,      { fields: [warnings.tenantId],      references: [tenants.id] }),
  rule:        one(warningRules, { fields: [warnings.ruleId],        references: [warningRules.id] }),
  transaction: one(transactions, { fields: [warnings.transactionId], references: [transactions.id] }),
}))
