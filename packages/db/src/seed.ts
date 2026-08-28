import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { banks, cryptos } from './schema/index.js'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required')
  process.exit(1)
}


async function seed() {
  const client = postgres(DATABASE_URL!)
  const db = drizzle(client)

  try {
    console.log('🌱 Seed verisi oluşturuluyor...')

    // Türk bankaları (global preset)
    await db.insert(banks).values([
      { name: 'Ziraat Bankası' },
      { name: 'Halkbank' },
      { name: 'VakıfBank' },
      { name: 'Türkiye İş Bankası' },
      { name: 'Garanti BBVA' },
      { name: 'Yapı ve Kredi Bankası' },
      { name: 'Akbank' },
      { name: 'Denizbank' },
      { name: 'TEB (Türk Ekonomi Bankası)' },
      { name: 'QNB Finansbank' },
      { name: 'ING Bank' },
      { name: 'HSBC Turkey' },
      { name: 'Odeabank' },
      { name: 'Şekerbank' },
      { name: 'Alternatif Bank' },
      { name: 'Burgan Bank' },
      { name: 'ICBC Turkey' },
      { name: 'Anadolubank' },
      { name: 'Fibabanka' },
      { name: 'Turkish Bank' },
      { name: 'Kuveyt Türk' },
      { name: 'Albaraka Türk' },
      { name: 'Türkiye Finans' },
      { name: 'Vakıf Katılım' },
      { name: 'Ziraat Katılım' },
      { name: 'PTT Bank' },
    ]).onConflictDoNothing()
    console.log('✅ Bankalar eklendi (26 banka)')

    // Kripto paralar (global preset — desteklenen 6 kripto)
    await db.insert(cryptos).values([
      { name: 'Bitcoin',  symbol: 'BTC'  },
      { name: 'Ethereum', symbol: 'ETH'  },
      { name: 'XRP',      symbol: 'XRP'  },
      { name: 'Tron',     symbol: 'TRX'  },
      { name: 'Dogecoin', symbol: 'DOGE' },
      { name: 'Tether',   symbol: 'USDT' },
    ]).onConflictDoNothing()
    console.log('✅ Kripto paralar eklendi (6 kripto)')

    console.log('\n✅ Seed verisi başarıyla oluşturuldu!')
  } finally {
    await client.end()
  }
}

seed().catch((err) => {
  console.error('❌ Seed hatası:', err)
  process.exit(1)
})
