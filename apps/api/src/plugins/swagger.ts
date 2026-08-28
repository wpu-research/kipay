import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { env } from '../config/env.js';

// x-tagGroups: Redoc'a özgü extension — iki üst-seviye bölüm tanımlar:
//   1. Panel API  — tüm panel-internal endpoint'ler (alt gruplar halinde)
//   2. Merchant API (HMAC) — merchant entegrasyon endpoint'leri
const TAG_GROUPS = [
  {
    name: 'Panel API',
    tags: [
      'Auth',
      'Users',
      'Tenants',
      'Merchants',
      'Transactions',
      'Payment Accounts',
      'Payment Providers',
      'Notifications',
      'Warnings',
      'Blocked Players',
      'Reports',
      'Audit Logs',
      'ExchangeRates',
      'Settings',
      'Banks',
      'Cryptos',
      'System',
    ],
  },
  {
    name: 'Merchant API (HMAC)',
    tags: ['Merchant API'],
  },
]

export default fp(async (app) => {
  // @ts-ignore — x-tagGroups Redoc extension openapi tipinde tanımlı değil; overload hatası bastırılıyor
  await app.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Panel API',
        description: 'Panel ödeme yönetim sistemi API dokümantasyonu',
        version: '1.0.0',
      },
      tags: [
        { name: 'Auth',              description: 'Kimlik doğrulama, oturum yönetimi, masquerade' },
        { name: 'Users',             description: 'Kullanıcı yönetimi, engelleme/engel kaldırma' },
        { name: 'Tenants',           description: 'Tenant yönetimi (super_admin)' },
        { name: 'Merchants',         description: 'Merchant yönetimi, API key\'ler ve IP whitelist' },
        { name: 'Transactions',      description: 'İşlemler, claim/approve/reject, callback\'ler' },
        { name: 'Payment Accounts',  description: 'Ödeme hesapları ve günlük limit yönetimi' },
        { name: 'Payment Providers', description: 'Ödeme sağlayıcılar ve kategoriler' },
        { name: 'Notifications',     description: 'Bildirimler ve SSE bağlantısı' },
        { name: 'Warnings',          description: 'Uyarı kuralları ve uyarı yönetimi' },
        { name: 'Blocked Players',   description: 'Oyuncu engelleme listesi' },
        { name: 'Reports',           description: 'İşlem ve callback raporları, export' },
        { name: 'Audit Logs',        description: 'Denetim logları' },
        { name: 'ExchangeRates',     description: 'Döviz kurları' },
        { name: 'Settings',          description: 'Sistem ayarları' },
        { name: 'Banks',             description: 'Preset banka listesi' },
        { name: 'Cryptos',           description: 'Preset kripto para listesi' },
        { name: 'System',            description: 'Sistem sağlık ve kuyruk istatistikleri' },
        { name: 'Merchant API',      description: 'HMAC imzalı merchant API (deposit, withdrawal)' },
      ],
      'x-tagGroups': TAG_GROUPS,
    },
  });

  if (env.NODE_ENV !== 'production') {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list' },
    });
  }
});
