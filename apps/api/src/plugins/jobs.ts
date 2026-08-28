import fp from 'fastify-plugin'
import { PgBoss } from 'pg-boss'
import { env } from '../config/env.js'
import { dailyLimitReset } from '../jobs/daily-limit-reset.js'
import { claimTimeout } from '../jobs/claim-timeout.js'
import { callbackRetry } from '../jobs/callback-retry.js'
import { nonceCleanup } from '../jobs/nonce-cleanup.js'
import { rateSync } from '../jobs/rate-sync.js'
import { reportExport } from '../jobs/report-export.js'
import { cleanupExports } from '../jobs/cleanup-exports.js'
import { callbackRecovery } from '../jobs/callback-recovery.js'

export default fp(async (app) => {
  const boss = new PgBoss(env.DATABASE_URL)

  boss.on('error', (err) => console.error('[pg-boss] hata:', err))

  await boss.start()
  console.log('[pg-boss] started')

  // pg-boss v12: queue'lar kullanımdan önce oluşturulmalı
  await boss.createQueue('daily-limit-reset')
  await boss.createQueue('claim-timeout')
  await boss.createQueue('callback-retry')
  await boss.createQueue('nonce-cleanup')
  await boss.createQueue('rate-sync')
  await boss.createQueue('report-export')
  await boss.createQueue('cleanup-exports')
  await boss.createQueue('callback-recovery')

  // daily-limit-reset: UTC gece yarısı (cron: "0 0 * * *")
  await boss.schedule('daily-limit-reset', '0 0 * * *', {}, { tz: 'UTC' })
  await boss.work('daily-limit-reset', dailyLimitReset)
  await boss.work('claim-timeout', (jobs: unknown) => claimTimeout(jobs as Parameters<typeof claimTimeout>[0], boss))

  const callbackWorkerId = await boss.work('callback-retry', callbackRetry)
  console.log(`[pg-boss] callback-retry worker registered: ${callbackWorkerId}`)

  await boss.schedule('nonce-cleanup', '0 * * * *', {}, { tz: 'UTC' })
  await boss.work('nonce-cleanup', nonceCleanup)
  await boss.schedule('rate-sync', '*/10 * * * *', {}, { tz: 'UTC' })
  await boss.work('rate-sync', rateSync)
  await boss.work('report-export', reportExport)
  // cleanup-exports: her gece 02:00 UTC — süresi dolmuş export dosyalarını sil
  await boss.schedule('cleanup-exports', '0 2 * * *', {}, { tz: 'UTC' })
  await boss.work('cleanup-exports', cleanupExports)
  // callback-recovery: her 5 dakikada — pending kalmış callback'leri yeniden kuyruğa al (4-4/5-2 outbox recovery)
  await boss.schedule('callback-recovery', '*/5 * * * *', {}, { tz: 'UTC' })
  await boss.work('callback-recovery', (job) => callbackRecovery(job, boss))

  console.log('[pg-boss] tüm worker\'lar registered')

  app.decorate('boss', boss)
  app.addHook('onClose', async () => boss.stop())
})
