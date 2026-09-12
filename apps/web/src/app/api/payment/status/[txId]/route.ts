/**
 * GET /api/payment/status/:txId — widget bu ucu poll ediyor.
 */
import { NextResponse } from 'next/server'
import { getTransaction } from '@/lib/payment/panel-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ txId: string }> }) {
  const { txId } = await params
  const tx = getTransaction(txId)
  if (!tx) return NextResponse.json({ error: 'İşlem bulunamadı' }, { status: 404 })
  return NextResponse.json(tx)
}
