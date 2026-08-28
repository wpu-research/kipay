import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { env } from '../config/env.js';

export default fp(async (app) => {
  const allowedOrigins = env.FRONTEND_URL.split(',').map(s => s.trim())

  await app.register(cors, {
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  });
});
