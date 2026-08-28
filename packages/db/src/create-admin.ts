import { authenticator } from 'otplib'
import * as argon2 from 'argon2'
import { createCipheriv, randomBytes } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { tenants, users } from './schema/index.js'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('❌ DATABASE_URL gerekli'); process.exit(1) }

const TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY
if (!TOTP_ENCRYPTION_KEY || TOTP_ENCRYPTION_KEY.length !== 64) {
  console.error('❌ TOTP_ENCRYPTION_KEY gerekli (64 hex karakter)')
  process.exit(1)
}

function encryptTotpSecret(secret: string): string {
  const key = Buffer.from(TOTP_ENCRYPTION_KEY!, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

async function run() {
  const client = postgres(DATABASE_URL!)
  const db = drizzle(client)

  try {
    // Tenant oluştur veya mevcut olanı bul
    let [tenant] = await db.select().from(tenants).limit(1)
    if (!tenant) {
      const result = await db.insert(tenants).values({
        name: 'Super Admin',
        slug: 'super-admin',
        status: 'active',
      }).returning()
      tenant = result[0]!
      console.log(`✅ Tenant oluşturuldu: ${tenant.name} (${tenant.id})`)
    } else {
      console.log(`ℹ️  Mevcut tenant kullanılıyor: ${tenant.name} (${tenant.id})`)
    }

    const totpSecret = authenticator.generateSecret()
    const encryptedSecret = encryptTotpSecret(totpSecret)
    const passwordHash = await argon2.hash('Test1234!')

    await db.insert(users).values({
      tenantId: tenant.id,
      username: 'admin',
      passwordHash,
      role: 'super_admin',
      totpSecret: encryptedSecret,
      status: 'active',
    }).onConflictDoUpdate({
      target: users.username,
      set: { passwordHash, totpSecret: encryptedSecret, status: 'active', tenantId: tenant.id },
    })

    const otpUrl = authenticator.keyuri('admin', 'Panel', totpSecret)
    console.log('\n✅ Admin kullanıcı hazır')
    console.log('👤 Kullanıcı: admin')
    console.log('🔑 Şifre: Test1234!')
    console.log('📱 TOTP Secret:', totpSecret)
    console.log('📱 TOTP QR URL:', otpUrl)
  } finally {
    await client.end()
  }
}

run().catch((err) => { console.error('❌ Hata:', err); process.exit(1) })
