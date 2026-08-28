import { env } from './config/env.js';
import { buildApp } from './app.js';
import jobsPlugin from './plugins/jobs.js';

async function start(): Promise<void> {
  let isShuttingDown = false;

  try {
    const app = await buildApp();
    await app.register(jobsPlugin);

    const shutdown = async (signal: string): Promise<void> => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      app.log.info(`${signal} sinyali alındı. Sunucu kapatılıyor...`);
      await app.close();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    console.error('Sunucu başlatılamadı:', err);
    process.exit(1);
  }
}

start();
