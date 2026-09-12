/**
 * GET /api/payment/transactions/:userId
 */
import { NextResponse, type NextRequest } from 'next/server'
import { apiListTransactions } from '@/lib/payment/panel-api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 20)
  try {
    const result = await apiListTransactions(undefined, 1, limit)
    return NextResponse.json(result.data.filter(t => t.externalUserId === userId))
  } catch {
    return NextResponse.json([])
  }
}
