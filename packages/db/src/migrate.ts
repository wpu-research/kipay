import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'path'

export async function runMigrations(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 })
  const db = drizzle(sql)

  console.log("Veritabanı migration'ları çalıştırılıyor...")

  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, '../migrations'),
    })
    console.log("Migration'lar tamamlandı.")
  } finally {
    await sql.end()
  }
}
