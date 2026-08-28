import { authenticator } from 'otplib'
import { createDecipheriv } from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { users } from './schema/index.js'
import { eq } from 'drizzle-orm'

const DATABASE_URL = process.env.DATABASE_URL!
const TOTP_ENCRYPTION_KEY = process.env.TOTP_ENCRYPTION_KEY!

function decryptTotpSecret(encrypted: string): string {
  const [ivHex, tagHex, dataHex] = encrypted.split(':')
  const key = Buffer.from(TOTP_ENCRYPTION_KEY, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data) + decipher.final('utf8')
}

async function main() {
  const client = postgres(DATABASE_URL)
  const db = drizzle(client)

  const rows = await db.select().from(users).where(eq(users.username, 'finans_user'))
  const user = rows[0]

  const secret = decryptTotpSecret(user.totpSecret!)
  const currentCode = authenticator.generate(secret)
  const otpUrl = authenticator.keyuri('admin', 'Panel', secret)

  console.log('\n🔑 TOTP Secret:', secret)
  console.log('📱 Şu anki kod:', currentCode)
  console.log('🔗 Authenticator URL:', otpUrl)

  await client.end()
}

main().catch(console.error)
