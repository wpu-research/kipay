import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { env } from '../config/env.js';

export default fp(async (app) => {
  // Cookie okuma yapılandırması — JWT token'ı 'access_token' cookie'sinden doğrular.
  // httpOnly flag'i bu plugin'de değil, token yazılırken login endpoint'inde
  // reply.setCookie('access_token', token, { httpOnly: true, sameSite: 'strict' })
  // ile uygulanır (Story 1.4).
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: 'access_token',
      signed: false,
    },
    sign: { expiresIn: '15m' },
  });
});
