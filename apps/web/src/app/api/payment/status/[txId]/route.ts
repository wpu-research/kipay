/**
 * GET /api/payment/status/:txId — widget bu ucu poll ediyor.
 */
import { NextResponse } from 'next/server'
import { getTransaction, apiGetTransactionStatus } from '@/lib/payment/panel-api'
import { enforceRateLimit } from '@/lib/payment/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ txId: string }> }) {
  const limited = enforceRateLimit(request, 'status', 120)
  if (limited) return limited
  const { txId } = await params
  const tx = getTransaction(txId)
  if (tx) return NextResponse.json(tx)
  // Bellekte yok (redeploy/çoklu-instance) → gerçek panel'den durum sor
  const remote = await apiGetTransactionStatus(txId)
  if (remote) return NextResponse.json(remote)
  return NextResponse.json({ error: 'İşlem bulunamadı' }, { status: 404 })
}
