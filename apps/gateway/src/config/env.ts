import { z } from 'zod';

const envSchema = z.object({
  PORT:              z.coerce.number().int().min(1).max(65535).default(8000),
  HOST:              z.string().default('0.0.0.0'),
  NODE_ENV:          z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS:   z.string().default('*'),

  // Panel API
  PANEL_BASE_URL:    z.string().default(''),
  MERCHANT_ID:       z.string().default(''),
  API_KEY_ID:        z.string().default(''),
  API_SECRET:        z.string().default(''),
  CALLBACK_SECRET:   z.string().default(''),

  // Alerts
  ALERT_WEBHOOK_URL:   z.string().default(''),
  WEBHOOK_REQUIRE_SIG: z.string().default('false'),

  // Chrome (headless browser)
  CHROME_PATH:         z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Geçersiz environment değişkenleri:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

// Merchant credentials map
// Her merchant için tek env var: MERCHANT_1={"id":"...","keyId":"...","secret":"...","cbSecret":"...","origin":"https://site*.com"}
export interface MerchantCreds {
  keyId:         string;
  secret:        string;
  cbSecret:      string;
  originPattern: string;
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function matchesOrigin(pattern: string, origin: string): boolean {
  if (!pattern) return false;
  try { return wildcardToRegex(pattern).test(origin); } catch { return false; }
}

export function loadMerchantCreds(): Map<string, MerchantCreds> {
  const map = new Map<string, MerchantCreds>();
  for (let i = 1; i <= 20; i++) {
    const raw = (process.env[`MERCHANT_${i}`] ?? '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as {
        id: string; keyId: string; secret: string; cbSecret?: string; origin?: string;
      };
      if (!parsed.id || !parsed.keyId || !parsed.secret) {
        console.warn(`[MERCHANT] MERCHANT_${i} eksik alan içeriyor, atlanıyor.`);
        continue;
      }
      map.set(parsed.id, {
        keyId:         parsed.keyId,
        secret:        parsed.secret,
        cbSecret:      parsed.cbSecret ?? '',
        originPattern: parsed.origin   ?? '',
      });
    } catch {
      console.warn(`[MERCHANT] MERCHANT_${i} geçersiz JSON, atlanıyor.`);
    }
  }
  if (map.size === 0) {
    console.warn('[MERCHANT] .env\'de merchant tanımlanmamış (MERCHANT_1, MERCHANT_2 vb.)');
  }
  return map;
}
