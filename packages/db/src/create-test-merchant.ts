import { randomBytes, createCipheriv, scryptSync } from 'node:crypto'

// apps/api/lib/secret-crypto ile AYNI algoritma — monorepo rootDir sınırı
// nedeniyle burada yerel kopya (db paketi apps/api'den import edemez).
function encryptSecret(plain: string): string {
  const raw = process.env.MERCHANT_SECRET_ENC_KEY
  if (!raw || raw.length < 32) throw new Error('MERCHANT_SECRET_ENC_KEY tanımlı değil veya kısa.')
  const key = scryptSync(raw, 'kipay-merchant-secret', 32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'
import { eq, and } from 'drizzle-orm'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required')
  process.exit(1)
}

function generateApiKey() {
  const keyId      = 'key_' + randomBytes(8).toString('hex')
  const secret          = 'sk_'  + randomBytes(32).toString('hex')
  const secretEncrypted = encryptSecret(secret)
  return { keyId, secret, secretEncrypted }
}

async function upsert<T>(
  label: string,
  find: () => Promise<T | undefined>,
  create: () => Promise<T>,
): Promise<T> {
  const existing = await find()
  if (existing) {
    console.log(`✅ Mevcut kullanılıyor: ${label}`)
    return existing
  }
  const created = await create()
  console.log(`✅ Oluşturuldu: ${label}`)
  return created
}

async function run() {
  const client = postgres(DATABASE_URL!)
  const db = drizzle(client, { schema })

  try {
    // 1. Tenant
    const [tenant] = await db.select().from(schema.tenants)
      .where(eq(schema.tenants.status, 'active')).limit(1)
    if (!tenant) {
      console.error('❌ Aktif tenant bulunamadı. Önce seed çalıştır.')
      process.exit(1)
    }
    console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`)

    // 2. Payment account (bank tipi, sandbox)
    const bank = await db.select().from(schema.banks).limit(1).then(r => r[0])

    await upsert(
      'Test IBAN TR330006100519786457841326',
      async () => {
        const [r] = await db.select().from(schema.paymentAccounts)
          .where(and(
            eq(schema.paymentAccounts.tenantId, tenant.id),
            eq(schema.paymentAccounts.accountNumber, 'TR330006100519786457841326'),
          )).limit(1)
        return r
      },
      async () => {
        const [r] = await db.insert(schema.paymentAccounts).values({
          tenantId:      tenant.id,
          type:          'bank',
          bankId:        bank?.id ?? null,
          name:          'Test IBAN',
          accountNumber: 'TR330006100519786457841326',
          environment:   'sandbox',
          status:        'active',
          dailyLimit:    '100000.00',
          dailyUsed:     '0',
        }).returning()
        return r!
      },
    )

    // 3. Merchant
    let [merchant] = await db.select().from(schema.merchants)
      .where(and(
        eq(schema.merchants.tenantId, tenant.id),
        eq(schema.merchants.merchantName, 'Test Merchant'),
      )).limit(1)

    if (!merchant) {
      const [r] = await db.insert(schema.merchants).values({
        tenantId:       tenant.id,
        merchantName:   'Test Merchant',
        webhookUrl:     'https://webhook.site/test',
        isSandbox:      true,
        status:         'active',
        callbackSecret: randomBytes(32).toString('hex'),
      }).returning()
      merchant = r!
      console.log('✅ Oluşturuldu: Test Merchant')
    } else {
      console.log('✅ Mevcut kullanılıyor: Test Merchant')
    }

    // callbackSecret null ise güncelle (eski kayıtlar için)
    if (!merchant.callbackSecret) {
      const callbackSecret = randomBytes(32).toString('hex')
      await db.update(schema.merchants)
        .set({ callbackSecret })
        .where(eq(schema.merchants.id, merchant.id))
      merchant = { ...merchant, callbackSecret }
      console.log('✅ Merchant callbackSecret oluşturuldu')
    }

    // 4. Exchange rate (her çalışmada tazele)
    await db.insert(schema.exchangeRates).values({
      fromCurrency: 'USDT',
      toCurrency:   'TRY',
      rate:         '38.50',
      source:       'manual',
      fetchedAt:    new Date(),
    })
    console.log('✅ Exchange rate eklendi: 1 USDT = 38.50 TRY')

    // 5. API key oluştur
    const { keyId, secret, secretEncrypted } = generateApiKey()
    await db.insert(schema.merchantApiKeys).values({
      merchantId: merchant.id,
      tenantId:   tenant.id,
      keyId,
      secretEncrypted,
      label:      'test-key',
    })

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔑 Merchant API Credentials')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Merchant ID     : ${merchant.id}`)
    console.log(`Key ID          : ${keyId}`)
    console.log(`Secret          : ${secret}`)
    console.log(`X-API-Key       : ${keyId}:${secret}`)
    console.log(`Callback Secret : ${merchant.callbackSecret}`)
    console.log(`Webhook URL     : ${merchant.webhookUrl}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('⚠️  Secret bir daha görüntülenemez, şimdi kaydet.')
  } finally {
    await client.end()
  }
}

run().catch((err) => {
  console.error('❌ Hata:', err)
  process.exit(1)
})
