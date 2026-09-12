/**
 * POST /api/payment/withdrawal — para çekme talebi.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { checkMerchant } from '@/lib/payment/merchant'
import { apiWithdrawalRequest, storeTxCreds } from '@/lib/payment/panel-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  merchant_id:   string
  user_id?:      string
  method?:       string
  amount:        number
  currency?:     string
  iban?:         string
  account_name?: string
}

export async function POST(request: NextRequest) {
  const { merchant_id, user_id, method, amount, currency, iban, account_name } =
    await request.json() as Body

  if (!merchant_id || typeof amount !== 'number') {
    return NextResponse.json({ error: 'merchant_id ve amount zorunlu.' }, { status: 400 })
  }

  const check = checkMerchant(merchant_id, request.headers.get('origin') ?? '')
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })
  const { creds } = check

  try {
    const data = await apiWithdrawalRequest(
      user_id ?? 'anonymous', amount, currency ?? 'TRY', method ?? 'havale',
      iban, account_name, creds.keyId, creds.secret,
    )
    const txId = String(data['txId'] ?? '')
    if (txId) storeTxCreds(txId, { keyId: creds.keyId, secret: creds.secret, cbSecret: creds.cbSecret })
    return NextResponse.json({ success: true, ...data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
