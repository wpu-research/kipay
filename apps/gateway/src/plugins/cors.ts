import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

export default fp(async (app: FastifyInstance) => {
  const rawOrigins = env.ALLOWED_ORIGINS;
  const origins = rawOrigins === '*'
    ? '*' as const
    : rawOrigins.split(',').map(s => s.trim()).filter(Boolean);

  if (origins === '*') {
    app.log.warn('[CORS] Tüm origin\'ler kabul ediliyor — prod\'da ALLOWED_ORIGINS tanımla!');
  }

  await app.register(cors, {
    origin:      origins,
    credentials: origins !== '*',
    methods:     ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Merchant-Id'],
  });
});
