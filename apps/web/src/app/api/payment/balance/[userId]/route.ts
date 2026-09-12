/**
 * GET /api/payment/balance/:userId — onaylanmış işlemlerden bakiye hesaplar.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { apiListTransactions } from '@/lib/payment/panel-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const merchant_id = request.nextUrl.searchParams.get('merchant_id') ?? undefined
  try {
    const result = await apiListTransactions('APPROVED', 1, 100)
    const txs    = result.data.filter(t => t.externalUserId === userId)
    const depSum = txs.filter(t => t.type === 'deposit').reduce((s, t) => s + parseFloat(t.amount), 0)
    const wdSum  = txs.filter(t => t.type === 'withdrawal').reduce((s, t) => s + parseFloat(t.amount), 0)
    return NextResponse.json({ user_id: userId, balance: 3500 + depSum - wdSum, currency: 'TRY', merchant_id })
  } catch {
    return NextResponse.json({ user_id: userId, balance: 3500, currency: 'TRY' })
  }
}
