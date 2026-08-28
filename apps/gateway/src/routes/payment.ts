/**
 * Payment API routes — /api/payment/*
 */
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { env, loadMerchantCreds, matchesOrigin } from '../config/env.js';
import {
  apiDepositInitiate,
  apiDepositConfirm,
  apiWithdrawalRequest,
  apiWithdrawalCancel,
  apiListTransactions,
  getTransaction,
  storeTxCreds,
  cleanupTxCreds,
} from '../services/panel-api.js';

const MERCHANT_CREDS = loadMerchantCreds();

async function alertNoAccount(merchantId: string, amount: number | string) {
  if (!env.ALERT_WEBHOOK_URL) return;
  fetch(env.ALERT_WEBHOOK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      event:       'NO_AVAILABLE_ACCOUNT',
      merchant_id: merchantId,
      amount:      String(amount),
      message:     'Ödeme hesapları dolu veya limit aşıldı.',
    }),
  }).catch(() => {});
}

export async function paymentRoutes(app: FastifyInstance) {
  // POST /api/payment/account
  app.post<{
    Body: {
      merchant_id: string;
      user_id?:    string;
      method:      string;
      bank_id?:    string;
      amount:      number;
      currency?:   string;
      iban?:       string;
      account_name?:string;
    };
  }>(
    '/api/payment/account',
    {
      schema: {
        body: {
          type: 'object',
          required: ['merchant_id', 'method', 'amount'],
          properties: {
            merchant_id:  { type: 'string' },
            user_id:      { type: 'string' },
            method:       { type: 'string' },
            bank_id:      { type: 'string' },
            amount:       { type: 'number' },
            currency:     { type: 'string' },
            iban:         { type: 'string' },
            account_name: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { merchant_id, user_id, method, amount } = request.body;

      const creds = MERCHANT_CREDS.get(merchant_id);
      if (!creds) {
        app.log.warn(`[MERCHANT] Bilinmeyen merchant_id: ${merchant_id}`);
        return reply.status(403).send({ error: 'Bilinmeyen merchant.' });
      }

      const origin = request.headers['origin'] ?? '';
      if (creds.originPattern && !matchesOrigin(creds.originPattern, origin)) {
        app.log.warn(`[MERCHANT] Origin reddedildi: ${origin} (beklenen: ${creds.originPattern})`);
        return reply.status(403).send({ error: 'İzin verilmeyen origin.' });
      }

      try {
        // Mock credit card
        if (method === 'kredi_karti' || method === 'cekme') {
          return { success: true, transaction_id: randomUUID(), account: { type: '3ds', provider: 'mock' } };
        }

        const initCurrency = method === 'kripto' ? 'crypto' : 'TRY';
        const data = await apiDepositInitiate(
          user_id ?? 'anonymous',
          amount,
          initCurrency,
          creds.keyId,
          creds.secret,
          merchant_id,
        );

        const txId = data.txId ?? '';
        if (txId) {
          storeTxCreds(txId, { keyId: creds.keyId, secret: creds.secret, cbSecret: creds.cbSecret });
          cleanupTxCreds();
        }

        if (method === 'kripto') {
          return {
            success:         true,
            transaction_id:  txId,
            method:          'kripto',
            deposit_address: data.depositAddress ?? '',
            crypto_amounts:  data.cryptoAmounts ?? {},
            try_amount:      data.amount ?? '',
            expires_at:      data.expiresAt,
            status:          data.status,
          };
        }

        return {
          success:         true,
          transaction_id:  txId,
          method,
          account: {
            iban: data.ibanWallet ?? '',
            name: data.accountName ?? '',
            bank: data.bank ?? '',
          },
          expires_at: data.expiresAt,
          status:     data.status,
        };

      } catch (err) {
        const msg = String(err);
        if (msg.includes('NO_AVAILABLE_ACCOUNT')) {
          app.log.error(`[ALERT] NO_AVAILABLE_ACCOUNT — merchant=${merchant_id} amount=${amount}`);
          alertNoAccount(merchant_id, amount);
          return reply.status(422).send({ error: 'NO_AVAILABLE_ACCOUNT' });
        }
        app.log.error(`payment_get_account hata: ${msg}`);
        return reply.status(500).send({ error: msg });
      }
    },
  );

  // POST /api/payment/confirm
  app.post<{
    Body: { transaction_id: string; currency?: string; note?: string };
  }>(
    '/api/payment/confirm',
    {
      schema: {
        body: {
          type: 'object',
          required: ['transaction_id'],
          properties: {
            transaction_id: { type: 'string' },
            currency:       { type: 'string' },
            note:           { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { transaction_id, currency } = request.body;
      try {
        const data = await apiDepositConfirm(transaction_id, currency);
        return { success: true, txId: data['txId'], status: data['status'] };
      } catch (err) {
        app.log.error(`payment_confirm hata: ${String(err)}`);
        return reply.status(500).send({ error: String(err) });
      }
    },
  );

  // GET /api/payment/status/:txId
  app.get<{ Params: { txId: string } }>(
    '/api/payment/status/:txId',
    {
      schema: {
        params: {
          type: 'object',
          properties: { txId: { type: 'string' } },
          required: ['txId'],
        },
      },
    },
    async (request, reply) => {
      const tx = getTransaction(request.params.txId);
      if (!tx) return reply.status(404).send({ error: 'İşlem bulunamadı' });
      return tx;
    },
  );

  // GET /api/payment/balance/:userId
  app.get<{ Params: { userId: string }; Querystring: { merchant_id?: string } }>(
    '/api/payment/balance/:userId',
    {
      schema: {
        params: {
          type: 'object',
          properties: { userId: { type: 'string' } },
          required: ['userId'],
        },
      },
    },
    async (request, _reply) => {
      const { userId }    = request.params;
      const { merchant_id } = request.query;
      try {
        const result = await apiListTransactions('APPROVED', 1, 100);
        const txs    = result.data.filter(t => t.externalUserId === userId);
        const depSum = txs.filter(t => t.type === 'deposit').reduce((s, t) => s + parseFloat(t.amount), 0);
        const wdSum  = txs.filter(t => t.type === 'withdrawal').reduce((s, t) => s + parseFloat(t.amount), 0);
        const balance = 3500 + depSum - wdSum;
        return { user_id: userId, balance, currency: 'TRY', merchant_id };
      } catch {
        return { user_id: userId, balance: 3500, currency: 'TRY' };
      }
    },
  );

  // GET /api/payment/transactions/:userId
  app.get<{ Params: { userId: string }; Querystring: { limit?: number } }>(
    '/api/payment/transactions/:userId',
    {
      schema: {
        params: {
          type: 'object',
          properties: { userId: { type: 'string' } },
          required: ['userId'],
        },
      },
    },
    async (request, _reply) => {
      const { userId } = request.params;
      const limit = request.query.limit ?? 20;
      try {
        const result = await apiListTransactions(undefined, 1, limit);
        return result.data.filter(t => t.externalUserId === userId);
      } catch {
        return [];
      }
    },
  );

  // GET /api/payment/pending
  app.get<{ Querystring: { merchant_id?: string; status?: string } }>(
    '/api/payment/pending',
    async (request, _reply) => {
      const status = request.query.status ?? 'PENDING';
      try {
        const result = await apiListTransactions(status);
        return result.data;
      } catch {
        return [];
      }
    },
  );

  // POST /api/payment/withdrawal
  app.post<{
    Body: {
      merchant_id:   string;
      user_id?:      string;
      method?:       string;
      amount:        number;
      currency?:     string;
      iban?:         string;
      account_name?: string;
    };
  }>(
    '/api/payment/withdrawal',
    {
      schema: {
        body: {
          type: 'object',
          required: ['merchant_id', 'amount'],
          properties: {
            merchant_id:  { type: 'string' },
            user_id:      { type: 'string' },
            method:       { type: 'string' },
            amount:       { type: 'number' },
            currency:     { type: 'string' },
            iban:         { type: 'string' },
            account_name: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { merchant_id, user_id, method, amount, currency, iban, account_name } = request.body;
      const creds = MERCHANT_CREDS.get(merchant_id);
      if (!creds) {
        app.log.warn(`[MERCHANT] Bilinmeyen merchant_id: ${merchant_id}`);
        return reply.status(403).send({ error: 'Bilinmeyen merchant.' });
      }

      const origin = request.headers['origin'] ?? '';
      if (creds.originPattern && !matchesOrigin(creds.originPattern, origin)) {
        app.log.warn(`[MERCHANT] Origin reddedildi: ${origin} (beklenen: ${creds.originPattern})`);
        return reply.status(403).send({ error: 'İzin verilmeyen origin.' });
      }

      try {
        const data = await apiWithdrawalRequest(
          user_id ?? 'anonymous',
          amount,
          currency ?? 'TRY',
          method ?? 'havale',
          iban,
          account_name,
          creds.keyId,
          creds.secret,
        );
        const txId = String(data['txId'] ?? '');
        if (txId) {
          storeTxCreds(txId, { keyId: creds.keyId, secret: creds.secret, cbSecret: creds.cbSecret });
        }
        return { success: true, ...data };
      } catch (err) {
        return reply.status(500).send({ error: String(err) });
      }
    },
  );

  // DELETE /api/payment/withdrawal/:txId
  app.delete<{ Params: { txId: string } }>(
    '/api/payment/withdrawal/:txId',
    {
      schema: {
        params: {
          type: 'object',
          properties: { txId: { type: 'string' } },
          required: ['txId'],
        },
      },
    },
    async (request, reply) => {
      const { txId } = request.params;
      try {
        const data = await apiWithdrawalCancel(txId);
        return { success: true, ...data };
      } catch (err) {
        const msg = String(err);
        if (msg.includes('409') || msg.includes('CANNOT_CANCEL')) {
          return reply.status(409).send({ error: 'İşlem iptal edilemez — zaten işlemde veya tamamlandı' });
        }
        return reply.status(500).send({ error: msg });
      }
    },
  );
}
