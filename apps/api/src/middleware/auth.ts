import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { db, tenants, sessions, eq, and, isNull, gt, sql } from '@panel/db';

// JWT cookie doğrulama preHandler hook
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    const isExpired =
      err instanceof Error && err.name === 'TokenExpiredError';
    request.log.warn({ err }, 'JWT doğrulama başarısız');
    throw new AppError(
      isExpired ? 'TOKEN_EXPIRED' : 'UNAUTHORIZED',
      isExpired ? 'Oturum süresi doldu.' : 'Kimlik doğrulama başarısız.',
      401
    );
  }

  // AC-2: Her istekte session revoke + expiry kontrolü — pasif edilen veya süresi dolmuş session anında geçersiz kılınır
  const activeSession = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.id, request.user.sessionId),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, sql`now()`),
    ),
  });
  if (!activeSession) {
    throw new AppError('UNAUTHORIZED', 'Oturum geçersiz kılınmış.', 401);
  }

  // IG-1 / AC-3: Her istekte tenant status kontrolü — super_admin global yönetici, tenant'a bağlı değil
  if (request.user.role !== 'super_admin') {
    // P-4: tenantId null guard — eksik claim Drizzle'da bozuk SQL predicate oluşturur
    if (!request.user.tenantId) {
      throw new AppError('UNAUTHORIZED', 'Geçersiz token: tenantId eksik.', 401);
    }
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, request.user.tenantId),
    });
    // P-3: Bulunamayan tenant ile inactive tenant ayrı hata kodu verir
    if (!tenant) {
      throw new AppError('UNAUTHORIZED', 'Tenant bulunamadı.', 401);
    }
    // P-2 (CR-6): Allowlist — gelecekteki yeni status değerleri (ör. 'suspended') otomatik engellenir
    if (tenant.status !== 'active') {
      throw new AppError('TENANT_INACTIVE', 'Tenant aktif değil.', 403);
    }
  }
}
