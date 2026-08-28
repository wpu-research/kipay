import { env } from './config/env.js';
import { buildApp } from './app.js';

async function start(): Promise<void> {
  let isShuttingDown = false;

  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    app.log.info(`${signal} sinyali alındı. Gateway kapatılıyor...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    console.error('Gateway başlatılamadı:', err);
    process.exit(1);
  }
}

start();
