import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

// Merchant secret'larını GERİ-DÖNDÜRÜLEBİLİR şekilde şifreler.
// keyId-only auth için gerekli: header'da secret gelmediğinden, HMAC'i
// doğrulamak üzere DB'den ham secret'ı çözebilmemiz gerekir.
// Saklanan format: ivHex:authTagHex:cipherHex  (AES-256-GCM)
//
// MERCHANT_SECRET_ENC_KEY env değişkeni ana anahtardır (32+ karakter).

const ALGO = 'aes-256-gcm'

function masterKey(): Buffer {
  const raw = process.env.MERCHANT_SECRET_ENC_KEY
  if (!raw || raw.length < 32) {
    throw new Error('MERCHANT_SECRET_ENC_KEY tanımlı değil veya 32 karakterden kısa.')
  }
  return scryptSync(raw, 'kipay-merchant-secret', 32)
}

export function encryptSecret(plain: string): string {
  const iv     = randomBytes(12)
  const cipher = createCipheriv(ALGO, masterKey(), iv)
  const enc    = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptSecret(stored: string): string {
  const [ivHex, tagHex, dataHex] = stored.split(':')
  if (!ivHex || !tagHex || !dataHex) throw new Error('Bozuk şifreli secret formatı.')
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
}
