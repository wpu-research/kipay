import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { AppError } from './errors/app-error.js';

describe('buildApp - Global error handler', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();

    // Test için özel route: AppError fırlat
    app.get('/test/app-error', async () => {
      throw new AppError('TEST_CODE', 'Test hatası.', 422);
    });

    // Test için özel route: bilinmeyen hata fırlat
    app.get('/test/unknown-error', async () => {
      throw new Error('Bilinmeyen hata');
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('AppError formatında yanıt döndürmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/app-error',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: { code: 'TEST_CODE', message: 'Test hatası.', statusCode: 422 },
    });
  });

  it('bilinmeyen hata için 500 INTERNAL_SERVER_ERROR döndürmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/unknown-error',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Sunucu hatası.', statusCode: 500 },
    });
  });
});

describe('buildApp - Swagger', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/docs endpoint erişilebilir olmalı', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/docs',
    });

    // Swagger UI 302 veya 200 döner
    expect([200, 302]).toContain(response.statusCode);
  });
});
