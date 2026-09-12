/**
 * POST /api/payment/confirm — kullanıcı "Gönderdim" der.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { apiDepositConfirm } from '@/lib/payment/panel-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const { transaction_id, currency } = await request.json() as { transaction_id: string; currency?: string }
  if (!transaction_id) {
    return NextResponse.json({ error: 'transaction_id zorunlu.' }, { status: 400 })
  }
  try {
    const data = await apiDepositConfirm(transaction_id, currency)
    return NextResponse.json({ success: true, txId: data['txId'], status: data['status'] })
  } catch (err) {
    console.error(`payment_confirm hata: ${String(err)}`)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
