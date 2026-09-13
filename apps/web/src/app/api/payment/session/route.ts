/**
 * POST /api/payment/session — merchant backend'i KYC'yi burada verir, opak token alır.
 * Widget URL'inde yalnızca bu token (?s=) görünür; PII açıkta gitmez.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { checkMerchant } from '@/lib/payment/merchant'
import { encryptSession } from '@/lib/payment/session-token'
import { enforceRateLimit } from '@/lib/payment/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  merchant_id:      string
  user_id:          string
  identity_number:  string
  first_name:       string
  last_name:        string
  phone:            string
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, 'session', 60)
  if (limited) return limited

  const body = await request.json() as Body
  const { merchant_id, user_id, identity_number, first_name, last_name, phone } = body

  const check = checkMerchant(merchant_id, request.headers.get('origin') ?? '')
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  if (!user_id || !identity_number || !first_name || !last_name || !phone) {
    return NextResponse.json({ error: 'user_id, identity_number, first_name, last_name, phone zorunlu.' }, { status: 400 })
  }

  const token = encryptSession({
    merchantId:     merchant_id,
    userId:         user_id,
    identityNumber: identity_number,
    firstName:      first_name,
    lastName:       last_name,
    phone,
  })

  return NextResponse.json({ token })
}
