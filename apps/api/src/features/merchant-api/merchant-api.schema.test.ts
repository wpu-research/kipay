import { describe, it, expect } from 'vitest'
import { InitiateTransactionSchema, WithdrawalRequestSchema } from '@panel/types'

// Entegre eden sistemler (PHP) sayısal alanları JSON'a sayı olarak yazıyor.
// Anlamca geçerli bu istekler VALIDATION_ERROR almamalı.
const userInfo = {
  identityNumber: 21574521838,
  memberId:       40907081,
  firstName:      'Orkun',
  middleName:     '',
  lastName:       'Kökçü',
  phone:          '+905321234567',
}

describe('InitiateTransactionSchema — sayısal alanlar', () => {
  it('sayı olarak gelen amount/id alanlarını string’e çevirip kabul eder', () => {
    const parsed = InitiateTransactionSchema.parse({
      externalUserId: 40907081,
      amount:         500.00,
      currency:       'TRY',
      userInfo,
    })
    expect(parsed.amount).toBe('500')
    expect(parsed.externalUserId).toBe('40907081')
    expect(parsed.userInfo.identityNumber).toBe('21574521838')
    expect(parsed.userInfo.memberId).toBe('40907081')
  })

  it('kuruşlu tutarı korur', () => {
    const parsed = InitiateTransactionSchema.parse({
      externalUserId: '40907081', amount: 500.5, currency: 'TRY', userInfo,
    })
    expect(parsed.amount).toBe('500.5')
  })

  it('geçersiz TC checksum’unu hâlâ reddeder', () => {
    const res = InitiateTransactionSchema.safeParse({
      externalUserId: 40907081, amount: 500, currency: 'TRY',
      userInfo: { ...userInfo, identityNumber: 12345678901 },
    })
    expect(res.success).toBe(false)
  })

  it('memberId ≠ externalUserId uyuşmazlığını hâlâ reddeder', () => {
    const res = InitiateTransactionSchema.safeParse({
      externalUserId: 999, amount: 500, currency: 'TRY', userInfo,
    })
    expect(res.success).toBe(false)
  })
})

describe('WithdrawalRequestSchema — sayısal alanlar', () => {
  it('sayı olarak gelen amount/externalUserId’i kabul eder', () => {
    const parsed = WithdrawalRequestSchema.parse({
      externalUserId:        40907081,
      amount:                750.25,
      currency:              'TRY',
      paymentMethod:         'IBAN',
      withdrawalAddress:     'TR330006100519786457841326',
      withdrawalAccountName: 'Orkun Kökçü',
      userInfo,
    })
    expect(parsed.amount).toBe('750.25')
    expect(parsed.externalUserId).toBe('40907081')
  })
})
