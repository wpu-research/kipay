import { db, sql } from '@panel/db'

export async function nonceCleanup() {
  const result = await db.execute(sql`
    DELETE FROM nonces
    WHERE expires_at < NOW() - INTERVAL '1 hour'
  `)
  console.log(`[nonce-cleanup] ${(result as unknown as { rowCount?: number }).rowCount ?? 0} eski nonce silindi`)
}
