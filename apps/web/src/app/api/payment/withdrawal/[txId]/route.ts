/**
 * DELETE /api/payment/withdrawal/:txId — çekme talebini iptal et.
 */
import { NextResponse } from 'next/server'
import { apiWithdrawalCancel } from '@/lib/payment/panel-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, { params }: { params: Promise<{ txId: string }> }) {
  const { txId } = await params
  try {
    const data = await apiWithdrawalCancel(txId)
    return NextResponse.json({ success: true, ...data })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('409') || msg.includes('CANNOT_CANCEL')) {
      return NextResponse.json(
        { error: 'İşlem iptal edilemez — zaten işlemde veya tamamlandı' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
