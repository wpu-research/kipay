import { runMigrations } from '@panel/db'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL ortam değişkeni tanımlanmamış')
  process.exit(1)
}

runMigrations(connectionString).catch((error: unknown) => {
  console.error('Migration hatası:', error)
  process.exit(1)
})
