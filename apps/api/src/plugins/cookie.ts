import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import { env } from '../config/env.js'

export default fp(async (app) => {
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECRET) {
    throw new Error('COOKIE_SECRET zorunludur (production ortamında cookie imzalama için gerekli)')
  }
  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
  })
})
