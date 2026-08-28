import { db, systemSettings, eq, sql } from '@panel/db'

const CLAIM_TIMEOUT_KEY = 'claim_timeout_minutes'
const TOTP_REQUIRED_KEY = 'totp_required'
const DEFAULT_TIMEOUT   = 10
const DEFAULT_TOTP      = false

async function upsertSetting(key: string, value: string, userId: string) {
  // Atomic upsert — race condition (SELECT + INSERT/UPDATE ayrı sorgu) önlenir
  await db.insert(systemSettings)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set:    { value, updatedAt: sql`NOW()`, updatedBy: userId },
    })
}

export const settingsService = {
  async getSettings(): Promise<{ claimTimeoutMinutes: number; totpRequired: boolean }> {
    const rows = await db.select().from(systemSettings)
    const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]))

    const minutes = parseInt(byKey[CLAIM_TIMEOUT_KEY] ?? '', 10)
    const totpRequired = byKey[TOTP_REQUIRED_KEY] !== undefined
      ? byKey[TOTP_REQUIRED_KEY] === 'true'
      : DEFAULT_TOTP

    return {
      claimTimeoutMinutes: isNaN(minutes) ? DEFAULT_TIMEOUT : minutes,
      totpRequired,
    }
  },

  async updateClaimTimeout(minutes: number, userId: string): Promise<{ claimTimeoutMinutes: number; totpRequired: boolean }> {
    await upsertSetting(CLAIM_TIMEOUT_KEY, String(minutes), userId)
    return this.getSettings()
  },

  async updateTotpRequired(totpRequired: boolean, userId: string): Promise<{ claimTimeoutMinutes: number; totpRequired: boolean }> {
    await upsertSetting(TOTP_REQUIRED_KEY, String(totpRequired), userId)
    return this.getSettings()
  },
}

export async function getClaimTimeoutMs(): Promise<number> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, CLAIM_TIMEOUT_KEY))
    const minutes = row ? parseInt(row.value, 10) : DEFAULT_TIMEOUT
    return (isNaN(minutes) ? DEFAULT_TIMEOUT : minutes) * 60 * 1000
  } catch (err) {
    console.error('[settings] getClaimTimeoutMs DB hatası — varsayılan kullanılıyor:', err)
    return DEFAULT_TIMEOUT * 60 * 1000
  }
}

export async function isTotpRequired(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, TOTP_REQUIRED_KEY))
    return row ? row.value === 'true' : DEFAULT_TOTP
  } catch (err) {
    console.error('[settings] isTotpRequired DB hatası — varsayılan kullanılıyor:', err)
    return DEFAULT_TOTP
  }
}
