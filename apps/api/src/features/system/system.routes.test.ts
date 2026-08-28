import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { db } from '@panel/db';

vi.mock('@panel/db', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 3 }]),
      }),
    }),
    query: {
      sessions: { findFirst: vi.fn() },
      tenants:  { findFirst: vi.fn() },
    },
  },
  transactions: {},
  sessions: {},
  tenants: {},
  eq:    vi.fn((col, val) => ({ col, val })),
  and:   vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((col) => ({ col })),
  gt:    vi.fn((col, val) => ({ col, val })),
  sql:   vi.fn((strings: TemplateStringsArray) => strings[0]),
  count: vi.fn().mockReturnValue('count()'),
}))

describe('GET /api/v1/system/health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('yeni health response shape döndürmeli (db ok, pgBoss error — test ortamında boss yok)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/system/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.db).toBe('ok');
    expect(body.pgBoss).toBe('error'); // test ortamında boss kayıtlı değil
    expect(body.status).toBe('degraded'); // pgBoss error nedeniyle degraded
    expect(typeof body.timestamp).toBe('string');
    // ISO 8601 timestamp
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});

describe('GET /api/v1/system/queue-stats', () => {
  let app: FastifyInstance;
  const mockDbQuery = db.query as unknown as {
    sessions: { findFirst: ReturnType<typeof vi.fn> }
    tenants:  { findFirst: ReturnType<typeof vi.fn> }
  };
  const SESSION_ID = '00000000-0000-0000-0000-000000000003';
  const TENANT_ID  = '00000000-0000-0000-0000-000000000002';
  const activeSession = { id: SESSION_ID, revokedAt: null };
  const activeTenant  = { id: TENANT_ID, status: 'active' as const };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockDbQuery.sessions.findFirst.mockReset();
    mockDbQuery.tenants.findFirst.mockReset();
    // Her test varsayılan olarak geçersiz session ile başlar
    mockDbQuery.sessions.findFirst.mockResolvedValue(null);
    mockDbQuery.tenants.findFirst.mockResolvedValue(activeTenant);
  });

  it('auth olmadan 401 döndürmeli', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/system/queue-stats',
    });
    expect(response.statusCode).toBe(401);
  });

  it('super_admin olmayan kullanıcı (geçersiz session) 401 almalı', async () => {
    // sessions mock null döndürüyor (beforeEach'te set edildi)
    const token = app.jwt.sign({
      userId: '00000000-0000-0000-0000-000000000001',
      tenantId: TENANT_ID,
      username: 'testuser',
      role: 'firma' as const,
      sessionId: SESSION_ID,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/system/queue-stats',
      headers: { authorization: `Bearer ${token}` },
    });
    // session bulunamadığı için authenticate 401 döner
    expect(response.statusCode).toBe(401);
  });

  it('geçerli session ama super_admin olmayan rol 403 almalı (AC5)', async () => {
    mockDbQuery.sessions.findFirst.mockResolvedValue(activeSession);
    const token = app.jwt.sign({
      userId:    '00000000-0000-0000-0000-000000000001',
      tenantId:  TENANT_ID,
      username:  'testuser',
      role:      'firma' as const,
      sessionId: SESSION_ID,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/system/queue-stats',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
  });
});
