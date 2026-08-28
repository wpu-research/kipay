import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

export default fp(async (app) => {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder(_req, context) {
      return {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Çok fazla istek. ${context.after} sonra tekrar deneyin.`,
          statusCode: 429,
        },
      }
    },
  });
});
