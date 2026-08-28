import path from 'path';
import Fastify, { type FastifyInstance } from 'fastify';
import staticPlugin from '@fastify/static';
import { env } from './config/env.js';
import corsPlugin from './plugins/cors.js';
import { paymentRoutes } from './routes/payment.js';
import { webhookRoutes } from './routes/webhook.js';
import { eventsRoutes } from './routes/events.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // rawBody — webhook HMAC doğrulaması için
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as Record<string, unknown>)['rawBody'] = body as string;
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // CORS
  await app.register(corsPlugin);

  // Static files — widget/
  await app.register(staticPlugin, {
    root:   path.join(process.cwd(), 'widget'),
    prefix: '/static/',
  });

  // Routes
  await app.register(paymentRoutes);
  await app.register(webhookRoutes);
  await app.register(eventsRoutes);

  // Health
  app.get('/health', async () => {
    return {
      status: 'ok',
      node:   process.version,
      env:    env.NODE_ENV,
    };
  });

  // Widget HTML
  app.get('/widget', async (_req, reply) => {
    reply.type('text/html');
    return reply.sendFile('index.html');
  });
  app.get('/widget.html', async (_req, reply) => {
    reply.type('text/html');
    return reply.sendFile('index.html');
  });

  // Error handler
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({ error: 'Sunucu hatası.' });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: 'Kaynak bulunamadı.' });
  });

  return app;
}
