/**
 * POST /api/payment/account — tutar gelir, en uygun hesap döner.
 * apps/gateway/src/routes/payment.ts'den taşındı.
 */
import { randomUUID } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { alertNoAccount, checkMerchant } from '@/lib/payment/merchant'
import { apiDepositInitiate, cleanupTxCreds, storeTxCreds } from '@/lib/payment/panel-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  merchant_id: string
  user_id?:    string
  method:      string
  bank_id?:    string
  amount:      number
  currency?:   string
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Body
  const { merchant_id, user_id, method, amount } = body

  if (!merchant_id || !method || typeof amount !== 'number') {
    return NextResponse.json({ error: 'merchant_id, method ve amount zorunlu.' }, { status: 400 })
  }

  const check = checkMerchant(merchant_id, request.headers.get('origin') ?? '')
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })
  const { creds } = check

  try {
    // Mock kredi kartı
    if (method === 'kredi_karti' || method === 'cekme') {
      return NextResponse.json({
        success: true, transaction_id: randomUUID(), account: { type: '3ds', provider: 'mock' },
      })
    }

    const initCurrency = method === 'kripto' ? 'crypto' : 'TRY'
    const data = await apiDepositInitiate(
      user_id ?? 'anonymous', amount, initCurrency, creds.keyId, creds.secret, merchant_id,
    )

    const txId = data.txId ?? ''
    if (txId) {
      storeTxCreds(txId, { keyId: creds.keyId, secret: creds.secret, cbSecret: creds.cbSecret })
      cleanupTxCreds()
    }

    if (method === 'kripto') {
      return NextResponse.json({
        success:         true,
        transaction_id:  txId,
        method:          'kripto',
        deposit_address: data.depositAddress ?? '',
        crypto_amounts:  data.cryptoAmounts ?? {},
        try_amount:      data.amount ?? '',
        expires_at:      data.expiresAt,
        status:          data.status,
      })
    }

    return NextResponse.json({
      success:        true,
      transaction_id: txId,
      method,
      account: {
        iban: data.ibanWallet ?? '',
        name: data.accountName ?? '',
        bank: data.bank ?? '',
      },
      expires_at: data.expiresAt,
      status:     data.status,
    })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('NO_AVAILABLE_ACCOUNT')) {
      console.error(`[ALERT] NO_AVAILABLE_ACCOUNT — merchant=${merchant_id} amount=${amount}`)
      alertNoAccount(merchant_id, amount)
      return NextResponse.json({ error: 'NO_AVAILABLE_ACCOUNT' }, { status: 422 })
    }
    console.error(`payment_get_account hata: ${msg}`)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
