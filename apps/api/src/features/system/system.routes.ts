import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { db, transactions, paymentAccounts, count, sql } from '@panel/db';
import { HealthResponseSchema, QueueStatsResponseSchema } from '@panel/types';
import { authenticate } from '../../middleware/auth.js';
import { AppError } from '../../errors/app-error.js';

async function requireSuperAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.user) {
    throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401);
  }
  if (request.user.role !== 'super_admin') {
    throw new AppError('FORBIDDEN', 'Bu işlem yalnızca super admin yetkisiyle yapılabilir.', 403);
  }
}

const JOB_NAMES = ['claim-timeout', 'callback-retry', 'daily-limit-reset', 'nonce-cleanup', 'rate-sync', 'report-export', 'cleanup-exports', 'callback-recovery'] as const;

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  // GET /health — public endpoint, auth gerektirmez
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
        },
        tags: ['System'],
        summary: 'Sistem sağlık kontrolü',
      },
    },
    async (): Promise<{ status: 'ok' | 'degraded'; db: 'ok' | 'error'; pgBoss: 'ok' | 'error'; timestamp: string }> => {
      let dbStatus: 'ok' | 'error' = 'ok';
      let pgBossStatus: 'ok' | 'error' = 'ok';

      // T1.1: DB bağlantı testi
      try {
        await db.execute(sql`SELECT 1`);
      } catch {
        dbStatus = 'error';
      }

      // T1.2: pg-boss durumu — test ortamında boss kayıtlı olmayabilir
      try {
        if (!app.boss) {
          pgBossStatus = 'error';
        } else {
          const installed = await app.boss.isInstalled();
          if (!installed) pgBossStatus = 'error';
        }
      } catch {
        pgBossStatus = 'error';
      }

      // T1.3: bir bileşen başarısız olursa 'degraded'
      const overallStatus: 'ok' | 'degraded' = dbStatus === 'ok' && pgBossStatus === 'ok' ? 'ok' : 'degraded';

      return {
        status: overallStatus,
        db: dbStatus,
        pgBoss: pgBossStatus,
        timestamp: new Date().toISOString(),
      };
    }
  );

  // GET /queue-stats — super_admin only
  app.withTypeProvider<ZodTypeProvider>().get(
    '/queue-stats',
    {
      preHandler: [authenticate, requireSuperAdmin],
      schema: {
        response: {
          200: QueueStatsResponseSchema,
        },
        tags: ['System'],
        summary: 'Kuyruk istatistikleri',
      },
    },
    async () => {
      // T2.2: pg-boss job istatistikleri — raw SQL; pgboss.job tablosu hazır değilse güvenli fallback
      type JobRow = { name: string; state: string; count: number };
      let jobRows: JobRow[] = [];
      try {
        const rawRows = await db.execute(sql`
          SELECT
            name,
            state,
            COUNT(*)::int AS count
          FROM pgboss.job
          WHERE name = ANY(ARRAY['claim-timeout','callback-retry','daily-limit-reset','nonce-cleanup','rate-sync','report-export','cleanup-exports','callback-recovery'])
          GROUP BY name, state
        `);
        jobRows = rawRows as unknown as JobRow[];
      } catch {
        // pg-boss şeması henüz kurulmamış veya erişilemiyor — sıfır istatistik döndür
      }

      // Her job için aggregation
      const queues = JOB_NAMES.map((jobName) => {
        const entries = jobRows.filter((r) => r.name === jobName);

        const completed = entries
          .filter((r) => r.state === 'completed')
          .reduce((sum, r) => sum + r.count, 0);

        const failed = entries
          .filter((r) => r.state === 'failed' || r.state === 'expired')
          .reduce((sum, r) => sum + r.count, 0);

        const active = entries
          .filter((r) => r.state === 'active')
          .reduce((sum, r) => sum + r.count, 0);

        const waiting = entries
          .filter((r) => r.state === 'created' || r.state === 'retry')
          .reduce((sum, r) => sum + r.count, 0);

        return { name: jobName, completed, failed, active, waiting };
      });

      // T2.3: callback_status dağılımı
      const callbackRows = await db
        .select({ callbackStatus: transactions.callbackStatus, count: count() })
        .from(transactions)
        .where(sql`${transactions.callbackStatus} IS NOT NULL`)
        .groupBy(transactions.callbackStatus);

      const cbMap: Record<string, number> = {}
      for (const r of callbackRows) cbMap[r.callbackStatus ?? ''] = Number(r.count)

      const callbackSummary = {
        pending: cbMap['pending'] ?? 0,
        sent:    cbMap['sent']    ?? 0,
        failed:  cbMap['failed']  ?? 0,
        dead:    cbMap['dead']    ?? 0,
      }
      const callbackFailedCount = callbackSummary.failed

      return { queues, callbackFailedCount, callbackSummary };
    }
  );

  // POST /reset/transactions — tüm işlem kayıtlarını sil (super_admin)
  app.post('/reset/transactions', {
    preHandler: [authenticate, requireSuperAdmin],
    schema: { tags: ['System'], summary: 'Tüm işlemleri sil' },
  }, async (_request, reply) => {
    await db.execute(sql`
      TRUNCATE TABLE transaction_comments, callback_logs, transactions RESTART IDENTITY CASCADE
    `)
    return reply.send({ ok: true })
  })

  // POST /reset/daily-limits — günlük limitleri sıfırla (super_admin)
  app.post('/reset/daily-limits', {
    preHandler: [authenticate, requireSuperAdmin],
    schema: { tags: ['System'], summary: 'Günlük limitleri sıfırla' },
  }, async (_request, reply) => {
    await db
      .update(paymentAccounts)
      .set({ dailyUsed: '0', lastResetAt: new Date() })
    return reply.send({ ok: true })
  })

  // POST /reset/payment-accounts — tüm ödeme hesaplarını sil (super_admin)
  app.post('/reset/payment-accounts', {
    preHandler: [authenticate, requireSuperAdmin],
    schema: { tags: ['System'], summary: 'Tüm ödeme hesaplarını sil' },
  }, async (_request, reply) => {
    await db.execute(sql`TRUNCATE TABLE payment_accounts RESTART IDENTITY CASCADE`)
    return reply.send({ ok: true })
  })

  // POST /reset/users-and-tenants — tüm kullanıcı ve tenant verilerini sil (super_admin)
  app.post('/reset/users-and-tenants', {
    preHandler: [authenticate, requireSuperAdmin],
    schema: { tags: ['System'], summary: 'Tüm kullanıcı ve tenantları sil' },
  }, async (request, reply) => {
    const currentUserId     = request.user!.userId
    const currentTenantId   = request.user!.tenantId
    // Mevcut super admin ve onun tenant'ı hariç tüm kullanıcı/tenant/audit log sil
    await db.execute(sql`DELETE FROM audit_logs WHERE tenant_id != ${currentTenantId}`)
    await db.execute(sql`DELETE FROM users WHERE id != ${currentUserId}`)
    await db.execute(sql`DELETE FROM tenants WHERE id != ${currentTenantId}`)
    return reply.send({ ok: true })
  })
}
