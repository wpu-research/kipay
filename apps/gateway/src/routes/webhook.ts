/**
 * Panel webhook — /webhook/panel
 * Panel işlem durumu değişince buraya POST atar
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { env, loadMerchantCreds } from '../config/env.js';
import { getTxCreds, updateTransaction } from '../services/panel-api.js';
import { sseNotify } from './events.js';

interface WebhookPayload {
  txId:            string;
  status:          string;
  externalUserId?: string;
  amount?:         string;
  currency?:       string;
  type?:           string;
  timestamp?:      string;
  signature?:      string;
  depositAddress?: string;
  accountName?:    string;
  bankName?:       string;
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post<{ Body: WebhookPayload }>(
    '/webhook',
    {
      config: { rawBody: true },
      schema: {
        body: {
          type: 'object',
          required: ['txId', 'status'],
          properties: {
            txId:            { type: 'string' },
            status:          { type: 'string' },
            externalUserId:  { type: 'string' },
            amount:          { type: 'string' },
            currency:        { type: 'string' },
            type:            { type: 'string' },
            timestamp:       { type: 'string' },
            signature:       { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const payload    = request.body;
      const requireSig = env.WEBHOOK_REQUIRE_SIG === 'true';

      // Signature from header or body
      const xSig    = (request.headers['x-signature'] as string | undefined) ?? undefined;
      const bodySig = payload.signature ?? undefined;
      const sigToCheck = xSig ?? bodySig;

      if (!sigToCheck) {
        if (requireSig) {
          app.log.warn(`[WEBHOOK] İmzasız istek reddedildi — txId=${payload.txId}`);
          return reply.status(401).send({ error: 'Signature required' });
        }
        app.log.warn(`[WEBHOOK] İmzasız webhook kabul edildi — txId=${payload.txId}`);
      }

      if (sigToCheck) {
        try {
          // Build canonical body without signature field
          const rawBody = (request as unknown as { rawBody?: string }).rawBody;
          const bodyDict = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : { ...payload };
          delete bodyDict['signature'];
          const canonical = JSON.stringify(bodyDict);

          const incoming = sigToCheck.startsWith('sha256=') ? sigToCheck : `sha256=${sigToCheck}`;

          // Collect candidate secrets
          const txCreds    = getTxCreds(payload.txId);
          const candidates: string[] = [];
          if (txCreds?.cbSecret) candidates.push(txCreds.cbSecret);
          const merchantMap = loadMerchantCreds();
          for (const creds of merchantMap.values()) {
            if (creds.cbSecret && !candidates.includes(creds.cbSecret)) {
              candidates.push(creds.cbSecret);
            }
          }

          let verified = false;
          for (const secret of candidates) {
            const expected = 'sha256=' + createHmac('sha256', secret).update(canonical).digest('hex');
            try {
              verified = timingSafeEqual(Buffer.from(expected), Buffer.from(incoming));
            } catch { /* length mismatch → not equal */ }
            if (verified) break;
          }

          if (!verified) {
            app.log.warn(`[WEBHOOK] İmza geçersiz! txId=${payload.txId}`);
            return reply.status(401).send({ error: 'Invalid signature' });
          }
          app.log.info(`[WEBHOOK] İmza doğrulandı ✓ txId=${payload.txId}`);
        } catch (err) {
          app.log.warn(`[WEBHOOK] İmza doğrulama hatası: ${String(err)}`);
        }
      }

      // Normalize status
      let status = payload.status;
      if (status === 'COMPLETED') status = 'APPROVED';
      if (status === 'FLAGGED') {
        app.log.warn(`[WEBHOOK] FLAGGED — txId=${payload.txId} manuel inceleme gerekiyor`);
      }

      app.log.info(`[WEBHOOK] txId=${payload.txId} status=${status} user=${payload.externalUserId} amount=${payload.amount}`);

      // Update in-memory transaction
      // PROCESSING webhook: hesap bilgisini de güncelle (v2 akışında claim anında gönderiliyor)
      const accountUpdates = payload.status === 'PROCESSING' && payload.depositAddress
        ? { ibanWallet: payload.depositAddress, accountName: payload.accountName, bank: payload.bankName ?? undefined }
        : {}
      updateTransaction(payload.txId, { status, ...accountUpdates });

      // SSE notify
      if (payload.externalUserId) {
        sseNotify(payload.externalUserId, {
          txId:     payload.txId,
          status,
          amount:   payload.amount,
          currency: payload.currency,
          type:     payload.type,
        });
      }

      if (status === 'TIMEOUT') {
        app.log.info(`[WEBHOOK] TIMEOUT — txId=${payload.txId} işlem süresi doldu`);
      }

      return reply.send({ received: true });
    },
  );
}
