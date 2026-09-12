/**
 * GET /api/payment/pending
 */
import { NextResponse, type NextRequest } from 'next/server'
import { apiListTransactions } from '@/lib/payment/panel-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') ?? 'PENDING'
  try {
    const result = await apiListTransactions(status)
    return NextResponse.json(result.data)
  } catch {
    return NextResponse.json([])
  }
}
