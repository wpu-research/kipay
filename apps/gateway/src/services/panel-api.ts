/**
 * Panel API Client — TypeScript
 * Gerçek panel bağlıysa HMAC imzalı istekler atar.
 * PANEL_BASE_URL boşsa mock mod kullanılır.
 */
import { createHmac, randomUUID } from 'crypto';
import { env } from '../config/env.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DepositInitiateResult {
  txId:           string;
  status:         string;
  ibanWallet?:    string;
  accountName?:   string;
  bank?:          string;
  depositAddress?:string;
  cryptoAmounts?: Record<string, string>;
  amount?:        string;
  currency?:      string;
  expiresAt?:     string;
}

export interface Transaction {
  txId:           string;
  status:         string;
  externalUserId: string;
  amount:         string;
  currency:       string;
  type:           string;
  ibanWallet?:    string;
  accountName?:   string;
  bank?:          string;
  expiresAt?:     string;
  note?:          string;
  _mock?:         boolean;
}

export interface ListResult {
  data: Transaction[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ─── Mock store ──────────────────────────────────────────────────────────

const mockTxMap = new Map<string, Transaction>();
let mockAccountIdx = 0;

const MOCK_ACCOUNTS = [
  { iban: 'TR33 0001 0017 4528 7507 4000 01', name: 'Ahmet Yılmaz',  bank: 'Ziraat' },
  { iban: 'TR61 0006 2000 1340 0006 2992 26', name: 'Mehmet Demir',  bank: 'Garanti' },
  { iban: 'TR96 0004 6005 5388 8000 1750 06', name: 'Fatih Çelik',   bank: 'Akbank' },
  { iban: 'TR29 0006 4000 0014 2990 7174 58', name: 'Zeynep Erdınç', bank: 'İş Bankası' },
  { iban: 'TR18 0006 7010 0000 0045 7214 73', name: 'Kemal Arslan',  bank: 'Yapı Kredi' },
  { iban: 'TR06 0001 2009 4520 0058 0005 01', name: 'Selin Şahin',   bank: 'Halkbank' },
  { iban: 'TR05 0001 5001 5800 7308 1879 44', name: 'Burak Öztürk',  bank: 'VakıfBank' },
  { iban: 'TR76 0013 4000 0189 3200 1000 01', name: 'Hatice Polat',  bank: 'DenizBank' },
  { iban: 'TR21 0020 5000 0987 2541 5000 01', name: 'Emirhan Doğan', bank: 'Kuveyt Türk' },
  { iban: 'TR41 0004 6005 5388 8000 1750 07', name: 'Ayşe Kaya',     bank: 'Akbank' },
];

// ─── HMAC helper ────────────────────────────────────────────────────────────

function makeHeaders(bodyRaw: string, keyId?: string, secret?: string, merchantId?: string) {
  const _keyId      = keyId      || env.API_KEY_ID;
  const _secret     = secret     || env.API_SECRET;
  const _merchantId = merchantId || env.MERCHANT_ID;
  const timestamp   = String(Math.floor(Date.now() / 1000));
  const nonce       = randomUUID();
  const canonical   = `${timestamp}\n${nonce}\n${bodyRaw}`;
  const signature   = createHmac('sha256', _secret)
    .update(canonical)
    .digest('hex');

  return {
    'Content-Type':  'application/json',
    'X-API-Key':     `${_keyId}:${_secret}`,
    'X-Merchant-Id': _merchantId,
    'X-Timestamp':   timestamp,
    'X-Nonce':       nonce,
    'X-Signature':   signature,
  };
}

async function merchantRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  keyId?: string,
  secret?: string,
  merchantId?: string,
): Promise<Record<string, unknown>> {
  const bodyRaw = body ? JSON.stringify(body) : '';
  const headers = makeHeaders(bodyRaw, keyId, secret, merchantId);
  const url     = `${env.PANEL_BASE_URL.replace(/\/$/, '')}${path}`;

  const res = await fetch(url, {
    method:  method.toUpperCase(),
    headers: headers as Record<string, string>,
    body:    bodyRaw || undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Panel API hatası ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

// ─── Mock mode detection ─────────────────────────────────────────────────

function useMock(): boolean {
  const url = env.PANEL_BASE_URL;
  return !url || url.includes('mock') || url === 'http://localhost:9999';
}

// ─── Mock implementations ────────────────────────────────────────────────

function mockDepositInitiate(
  externalUserId: string,
  amount: number,
  currency: string,
): DepositInitiateResult {
  const acc    = MOCK_ACCOUNTS[mockAccountIdx % MOCK_ACCOUNTS.length]!;
  mockAccountIdx++;
  const txId   = randomUUID();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const tx: Transaction = {
    txId, status: 'STARTED',
    ibanWallet:     acc.iban,
    accountName:    acc.name,
    bank:           acc.bank,
    amount:         amount.toFixed(2),
    currency,
    externalUserId,
    type:           'deposit',
    expiresAt:      expires,
    _mock:          true,
  };
  mockTxMap.set(txId, tx);
  return {
    txId, status: 'STARTED',
    ibanWallet:  acc.iban,
    accountName: acc.name,
    bank:        acc.bank,
    amount:      amount.toFixed(2),
    currency,
    expiresAt:   expires,
  };
}

function mockDepositConfirm(txId: string) {
  const tx = mockTxMap.get(txId);
  if (tx) tx.status = 'PENDING';
  return { txId, status: 'PENDING', _mock: true };
}

function mockWithdrawalRequest(
  externalUserId: string,
  amount: number,
  currency: string,
  paymentMethod: string,
): Record<string, unknown> {
  const txId = randomUUID();
  mockTxMap.set(txId, {
    txId, status: 'PENDING',
    externalUserId, amount: amount.toFixed(2),
    currency, type: 'withdrawal',
    _mock: true,
  } as Transaction);
  return { txId, status: 'PENDING', paymentMethod, _mock: true };
}

// ─── Public API ───────────────────────────────────────────────────────────

export async function apiDepositInitiate(
  externalUserId: string,
  amount: number,
  currency = 'TRY',
  keyId?: string,
  secret?: string,
  merchantId?: string,
): Promise<DepositInitiateResult> {
  if (useMock()) return mockDepositInitiate(externalUserId, amount, currency);

  const body = { externalUserId, amount: amount.toFixed(2), currency };
  const data = await merchantRequest('POST', '/merchant/v1/deposit/initiate', body, keyId, secret, merchantId);

  const txId   = String(data['txId'] ?? '');
  const address = String(data['ibanWallet'] ?? data['depositAddress'] ?? data['walletAddress'] ?? '');

  if (txId) {
    mockTxMap.set(txId, {
      txId, status: 'STARTED',
      ibanWallet: address, amount: String(data['amount'] ?? ''),
      currency:   String(data['currency'] ?? currency),
      expiresAt:  String(data['expiresAt'] ?? ''),
      externalUserId, type: 'deposit',
    });
  }

  return { txId, ...data, ibanWallet: address } as unknown as DepositInitiateResult;
}

export async function apiDepositConfirm(
  txId: string,
  currency?: string,
  keyId?: string,
  secret?: string,
): Promise<Record<string, unknown>> {
  if (useMock()) return mockDepositConfirm(txId);

  const body: Record<string, string> = { txId };
  if (currency) body['currency'] = currency;
  const data = await merchantRequest('POST', '/merchant/v1/deposit/player-confirmed', body, keyId, secret);

  const tx = mockTxMap.get(txId);
  if (tx) tx.status = String(data['status'] ?? 'PENDING');

  return data;
}

export async function apiWithdrawalRequest(
  externalUserId: string,
  amount: number,
  currency = 'TRY',
  paymentMethod = 'havale',
  iban?: string,
  accountName?: string,
  keyId?: string,
  secret?: string,
): Promise<Record<string, unknown>> {
  if (useMock()) return mockWithdrawalRequest(externalUserId, amount, currency, paymentMethod);

  const body: Record<string, unknown> = {
    externalUserId,
    amount:        amount.toFixed(2),
    currency,
    paymentMethod,
  };
  if (iban)        body['withdrawalAddress']     = iban;
  if (accountName) body['withdrawalAccountName'] = accountName;

  return merchantRequest('POST', '/merchant/v1/withdrawal/request', body, keyId, secret);
}

export async function apiWithdrawalCancel(
  txId: string,
  keyId?: string,
  secret?: string,
): Promise<Record<string, unknown>> {
  return merchantRequest('DELETE', `/merchant/v1/withdrawal/${txId}`, undefined, keyId, secret);
}

export async function apiListTransactions(
  status?: string,
  page = 1,
  limit = 20,
): Promise<ListResult> {
  if (useMock()) {
    let txs = Array.from(mockTxMap.values());
    if (status) txs = txs.filter(t => t.status === status.toUpperCase());
    txs.sort((a, b) => b.txId.localeCompare(a.txId));
    const data = txs.slice((page - 1) * limit, page * limit);
    return { data, meta: { total: txs.length, page, limit, totalPages: Math.max(1, Math.ceil(txs.length / limit)) } };
  }

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set('status', status);
  const data = await merchantRequest('GET', `/api/v1/transactions?${params}`);
  return data as unknown as ListResult;
}

export function getTransaction(txId: string): Transaction | undefined {
  return mockTxMap.get(txId);
}

export function updateTransaction(txId: string, updates: Partial<Transaction>) {
  const tx = mockTxMap.get(txId);
  if (tx) Object.assign(tx, updates);
}

export function storeTxCreds(txId: string, creds: { keyId: string; secret: string; cbSecret: string; _ts?: number }) {
  txCredsMap.set(txId, { ...creds, _ts: Date.now() });
}

export function getTxCreds(txId: string) {
  return txCredsMap.get(txId);
}

// ─── TX → merchant creds map (TTL 24h) ────────────────────────────────────

interface TxCreds { keyId: string; secret: string; cbSecret: string; _ts: number }
const txCredsMap = new Map<string, TxCreds>();
const TX_TTL_MS  = 24 * 60 * 60 * 1000;

export function cleanupTxCreds() {
  const cutoff = Date.now() - TX_TTL_MS;
  for (const [k, v] of txCredsMap) {
    if (v._ts < cutoff) txCredsMap.delete(k);
  }
}
