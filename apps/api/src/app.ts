import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import { ZodTypeProvider, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { AppError } from './errors/app-error.js';
import { auditLog } from './middleware/audit-log.js';
import corsPlugin from './plugins/cors.js';
import cookiePlugin from './plugins/cookie.js';
import jwtPlugin from './plugins/jwt.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import swaggerPlugin from './plugins/swagger.js';
import { systemRoutes } from './features/system/system.routes.js';
import { authRoutes } from './features/auth/auth.routes.js';
import { tenantRoutes } from './features/tenants/tenant.routes.js';
import { userRoutes } from './features/users/user.routes.js';
import { blockedUserRoutes } from './features/blocked-users/blocked-user.routes.js'
import { merchantRoutes } from './features/merchants/merchant.routes.js';
import { merchantApiKeyRoutes } from './features/merchants/merchant-api-key.routes.js';
import { paymentProviderRoutes } from './features/payment-providers/payment-provider.routes.js';
import { banksRoutes }          from './features/banks/banks.routes.js'
import { cryptosRoutes }        from './features/cryptos/cryptos.routes.js'
import { paymentAccountRoutes } from './features/payment-accounts/payment-account.routes.js';
import { merchantApiRoutes } from './features/merchant-api/merchant-api.routes.js';
import { notificationRoutes } from './features/notifications/notification.routes.js'
import { transactionRoutes } from './features/transactions/transaction.routes.js';
import { callbackRoutes }       from './features/callbacks/callback.routes.js'
import { callbackGlobalRoutes } from './features/callbacks/callback-global.routes.js'
import { blockedPlayerRoutes } from './features/blocked-players/blocked-player.routes.js';
import { warningRoutes } from './features/warnings/warning.routes.js';
import { auditRoutes } from './features/audit/audit.routes.js';
import { exchangeRateRoutes } from './features/exchange-rates/exchange-rate.routes.js';
import { reportRoutes }       from './features/reports/report.routes.js';
import { settingsRoutes }     from './features/settings/settings.routes.js';
import { profileRoutes }     from './features/profile/profile.routes.js';
import { env } from './config/env.js';

export async function buildApp(): Promise<FastifyInstance> {
  // P-3 fix: Virgülle ayrılmış IP listesi array'e bölünür
  // P-1 (CR-6): Yalnızca 'development'da truthy — staging gibi non-prod ortamlarda IP spoofing riski önlenir
  const trustProxy: boolean | string[] = env.TRUSTED_PROXY_IP
    ? env.TRUSTED_PROXY_IP.split(',').map(s => s.trim())
    : env.NODE_ENV === 'development'
  const app = Fastify({ logger: true, trustProxy }).withTypeProvider<ZodTypeProvider>();

  // Zod type provider compiler'larını kaydet
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // 1. CORS
  await app.register(corsPlugin);

  // 2. Cookie — JWT'den ÖNCE kayıtlı olmalı
  await app.register(cookiePlugin);

  // 3. JWT
  await app.register(jwtPlugin);

  // 4. Rate limit
  await app.register(rateLimitPlugin);

  // 5. Swagger + Swagger UI
  await app.register(swaggerPlugin);

  // Redoc UI — x-tagGroups ile Panel API / Merchant API ayrımını gösterir
  if (env.NODE_ENV !== 'production') {
    app.get('/redoc', async (_req, reply) => {
      return reply.type('text/html').send(`<!DOCTYPE html>
<html lang="tr">
<head>
  <title>Panel API — Redoc</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body { margin: 0; padding: 0; }</style>
</head>
<body>
  <redoc
    spec-url="/docs/json"
    expand-responses="200,201"
    hide-download-button
    theme='{"colors":{"primary":{"main":"#2563eb"}},"typography":{"fontSize":"14px","fontFamily":"Inter, system-ui, sans-serif"}}'
  ></redoc>
  <script src="https://cdn.jsdelivr.net/npm/redoc/bundles/redoc.standalone.js"></script>
</body>
</html>`)
    })
  }

  // rawBody erişimi — merchant HMAC doğrulaması için
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    ;(req as any).rawBody = body as string
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error, undefined)
    }
  });

  // 6. Global error handler
  app.setErrorHandler((error: FastifyError | AppError, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, statusCode: error.statusCode, ...(error.data ?? {}) },
      });
    }

    // Fastify validation hatası
    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Geçersiz istek.',
          statusCode: 400,
          details: error.validation.map((v: any) => ({
            field:   v.instancePath?.replace(/^\//, '') || v.params?.missingProperty || '',
            message: v.message,
          })),
        },
      });
    }

    // Bilinmeyen hata
    app.log.error(error);
    return reply.status(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Sunucu hatası.', statusCode: 500 },
    });
  });

  // 7. 404 handler
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Kaynak bulunamadı.', statusCode: 404 },
    });
  });

  // 8. Global onSend hook — audit log (route kayıtlarından ÖNCE)
  app.addHook('onSend', auditLog);

  // 9. Route'lar
  await app.register(systemRoutes, { prefix: '/api/v1/system' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(tenantRoutes, { prefix: '/api/v1/tenants' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(blockedUserRoutes, { prefix: '/api/v1/users' });
  await app.register(merchantRoutes, { prefix: '/api/v1/merchants' });
  await app.register(merchantApiKeyRoutes, { prefix: '/api/v1/merchants' });
  await app.register(paymentProviderRoutes, { prefix: '/api/v1/payment-providers' });
  await app.register(banksRoutes,          { prefix: '/api/v1/banks' });
  await app.register(cryptosRoutes,        { prefix: '/api/v1/cryptos' });
  await app.register(paymentAccountRoutes, { prefix: '/api/v1/payment-accounts' });
  await app.register(merchantApiRoutes,    { prefix: '/merchant/v1' });
  await app.register(notificationRoutes,  { prefix: '/api/v1/notifications' });
  await app.register(transactionRoutes,   { prefix: '/api/v1/transactions' });
  await app.register(callbackRoutes,        { prefix: '/api/v1/transactions' });
  await app.register(callbackGlobalRoutes,  { prefix: '/api/v1/callbacks' });
  await app.register(blockedPlayerRoutes,   { prefix: '/api/v1/blocked-players' });
  await app.register(warningRoutes,       { prefix: '/api/v1/warnings' });
  await app.register(auditRoutes,         { prefix: '/api/v1/audit-logs' });
  await app.register(exchangeRateRoutes,  { prefix: '/api/v1/exchange-rates' });
  await app.register(reportRoutes,        { prefix: '/api/v1/reports' });
  await app.register(settingsRoutes,      { prefix: '/api/v1/settings' });
  await app.register(profileRoutes,      { prefix: '/api/v1/profile' });

  return app;
}
