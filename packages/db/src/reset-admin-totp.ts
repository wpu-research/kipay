import { authenticator } from 'otplib'
import { createCipheriv, randomBytes } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { users } from './schema/index.js'
import { eq } from 'drizzle-orm'

const DATABASE_URL = process.env.DATABASE_URL!
const TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY!

function encryptTotpSecret(secret: string): string {
  const key = Buffer.from(TOTP_ENCRYPTION_KEY, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

async function reset() {
  const client = postgres(DATABASE_URL)
  const db = drizzle(client)

  const newSecret = authenticator.generateSecret()
  const encrypted = encryptTotpSecret(newSecret)

  await db.update(users).set({ totpSecret: encrypted }).where(eq(users.username, 'admin'))

  const otpUrl = authenticator.keyuri('admin', 'Panel', newSecret)
  console.log('\n✅ Admin TOTP sıfırlandı')
  console.log('🔑 TOTP Secret:', newSecret)
  console.log('📱 Google Authenticator URL:', otpUrl)
  console.log('\nŞifre değişmedi: Test1234!')

  await client.end()
}

reset().catch(console.error)
