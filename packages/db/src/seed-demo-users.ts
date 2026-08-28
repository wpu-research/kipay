/**
 * DEMO VERİ — ASLAN'ın panel testi için
 * 5 rolden kullanıcı + çeşitli statülerde işlemler + ödeme hesapları.
 * Çalıştır: node packages/db/dist/seed-demo-users.js
 *
 * Tüm demo kullanıcıların şifresi: Test1234!  (2FA kapalı)
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { randomBytes, createCipheriv, scryptSync } from 'node:crypto'
import * as argon2 from 'argon2'
import { eq } from 'drizzle-orm'
import * as schema from './schema/index.js'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('DATABASE_URL gerekli'); process.exit(1) }

const { tenants, merchants, users, paymentAccounts, transactions, banks } = schema

async function run() {
  const client = postgres(DATABASE_URL!)
  const db = drizzle(client, { schema })

  try {
    const passwordHash = await argon2.hash('Test1234!')

    // 1. Tenant (mevcut Super Admin tenant'ını kullan ya da oluştur)
    let [tenant] = await db.select().from(tenants).limit(1)
    if (!tenant) {
      [tenant] = await db.insert(tenants).values({ name: 'Kipay', slug: 'kipay', status: 'active' }).returning()
    }
    console.log('✅ Tenant:', tenant.name)

    // 2. Merchant (mevcut olanı kullan ya da oluştur)
    let [merchant] = await db.select().from(merchants).where(eq(merchants.tenantId, tenant.id)).limit(1)
    if (!merchant) {
      [merchant] = await db.insert(merchants).values({
        tenantId: tenant.id, merchantName: 'Demo Merchant',
        webhookUrl: 'https://webhook.site/test', isSandbox: true, status: 'active',
        callbackSecret: randomBytes(32).toString('hex'),
      }).returning()
    }
    console.log('✅ Merchant:', merchant.merchantName)

    // 3. Her rolden kullanıcı (2FA kapalı — totpSecret null)
    const demoUsers = [
      { username: 'tenant_admin',    role: 'tenant_admin'    as const, merchantId: null },
      { username: 'finans_admin',    role: 'finans_admin'    as const, merchantId: null },
      { username: 'finans_operator', role: 'finans_operator' as const, merchantId: null },
      { username: 'operator2',       role: 'finans_operator' as const, merchantId: null },
      { username: 'merchant_user',   role: 'merchant'        as const, merchantId: merchant.id },
    ]
    for (const u of demoUsers) {
      await db.insert(users).values({
        tenantId: tenant.id, merchantId: u.merchantId, username: u.username,
        passwordHash, role: u.role, status: 'active', totpSecret: null,
      }).onConflictDoUpdate({
        target: users.username,
        set: { passwordHash, role: u.role, status: 'active', totpSecret: null, tenantId: tenant.id },
      })
      console.log(`✅ Kullanıcı: ${u.username} (${u.role})`)
    }

    // 4. Banka referansı (seed.ts'ten gelen)
    const bankList = await db.select().from(banks).limit(3)
    const bankId = bankList[0]?.id ?? null

    // 5. Ödeme hesapları (havuz — farklı bankalar, farklı limitler)
    const accountsData = [
      { name: 'Ziraat - Ana Hesap',    accountNumber: 'TR33 0001 0017 4528 7507 4000 01', dailyLimit: '100000', dailyUsed: '15000' },
      { name: 'Garanti - Yedek Hesap', accountNumber: 'TR22 0006 2000 1234 5678 9012 34', dailyLimit: '50000',  dailyUsed: '48000' },
      { name: 'İş Bankası - VIP',      accountNumber: 'TR11 0006 4000 0011 2345 6789 01', dailyLimit: '200000', dailyUsed: '0' },
    ]
    const accountIds: string[] = []
    for (const a of accountsData) {
      const [acc] = await db.insert(paymentAccounts).values({
        tenantId: tenant.id, type: 'bank', bankId, name: a.name,
        accountNumber: a.accountNumber, environment: 'sandbox', status: 'active',
        dailyLimit: a.dailyLimit, dailyUsed: a.dailyUsed,
      }).returning()
      accountIds.push(acc.id)
      console.log(`✅ Ödeme hesabı: ${a.name}`)
    }

    // 6. İşlemler — her statüden, deposit + withdrawal karışık
    const members = [
      { id: 'MB-1001', tc: '10000000146', ad: 'Ahmet',  ikinci: '',     soyad: 'Yılmaz',  tel: '+905321112233' },
      { id: 'MB-1002', tc: '19191919190', ad: 'Ayşe',   ikinci: 'Nur',  soyad: 'Kaya',    tel: '+905331112233' },
      { id: 'MB-1003', tc: '29292929292', ad: 'Mehmet', ikinci: '',     soyad: 'Demir',   tel: '+905341112233' },
    ]
    const scenarios = [
      { type: 'deposit'    as const, status: 'STARTED'    as const, amount: '500.00'  },
      { type: 'deposit'    as const, status: 'PENDING'    as const, amount: '1000.00' },
      { type: 'deposit'    as const, status: 'PROCESSING' as const, amount: '750.50'  },
      { type: 'deposit'    as const, status: 'APPROVED'   as const, amount: '2500.00' },
      { type: 'deposit'    as const, status: 'REJECTED'   as const, amount: '300.00'  },
      { type: 'deposit'    as const, status: 'FLAGGED'    as const, amount: '9999.00' },
      { type: 'deposit'    as const, status: 'TIMEOUT'    as const, amount: '450.00'  },
      { type: 'withdrawal' as const, status: 'PENDING'    as const, amount: '1200.00' },
      { type: 'withdrawal' as const, status: 'PROCESSING' as const, amount: '800.00'  },
      { type: 'withdrawal' as const, status: 'APPROVED'   as const, amount: '3000.00' },
      { type: 'withdrawal' as const, status: 'REJECTED'   as const, amount: '600.00'  },
      { type: 'withdrawal' as const, status: 'CANCELLED'  as const, amount: '250.00'  },
    ]
    let i = 0
    for (const sc of scenarios) {
      const m = members[i % members.length]
      await db.insert(transactions).values({
        tenantId: tenant.id, merchantId: merchant.id,
        paymentAccountId: accountIds[i % accountIds.length],
        externalUserId: m.id, type: sc.type, status: sc.status,
        amount: sc.amount, currency: 'TRY',
        ...(sc.type === 'withdrawal' ? {
          paymentMethod: 'havale',
          withdrawalAddress: m.tc === '10000000146' ? 'TR33 0001 0017 4528 7507 4000 01' : 'TR22 0006 2000 1234 5678 9012 34',
          withdrawalAccountName: [m.ad, m.ikinci, m.soyad].filter(Boolean).join(' '),
        } : {}),
        userIdentityNumber: m.tc, userMemberId: m.id,
        userFirstName: m.ad, userMiddleName: m.ikinci, userLastName: m.soyad, userPhone: m.tel,
      })
      i++
    }
    console.log(`✅ ${scenarios.length} işlem oluşturuldu (deposit + withdrawal, tüm statüler)`)

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 DEMO VERİ HAZIR — ASLAN için')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Giriş: https://kipay.pro/login')
    console.log('Tüm kullanıcılar şifre: Test1234!  (2FA kapalı)')
    console.log('')
    console.log('Kullanıcılar:')
    console.log('  admin           → super_admin (tam yetki)')
    console.log('  tenant_admin    → tenant yöneticisi')
    console.log('  finans_admin    → finans yöneticisi')
    console.log('  finans_operator → operatör (işlem onaylama)')
    console.log('  operator2       → ikinci operatör')
    console.log('  merchant_user   → merchant görünümü')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } finally {
    await client.end()
  }
}

run().catch((e) => { console.error('❌ Hata:', e); process.exit(1) })
