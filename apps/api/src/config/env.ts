import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_TEMP_SECRET: z.string().min(32),
  TOTP_ENCRYPTION_KEY: z.string().length(64, 'Hex string; 32 byte = 64 karakter'),
  MERCHANT_SECRET_ENC_KEY: z.string().min(32, 'Merchant secret şifreleme anahtarı (min 32 karakter)'),
  COOKIE_SECRET: z.string().min(32).optional(),
  TRUSTED_PROXY_IP: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Geçersiz environment değişkenleri:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
