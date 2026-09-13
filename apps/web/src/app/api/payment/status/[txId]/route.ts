/**
 * GET /api/payment/status/:txId — widget bu ucu poll ediyor.
 *
 * Durum (status) için asıl kaynak PANEL'dir (otomatik red/onay callback'i nereye
 * giderse gitsin widget doğru durumu görsün). Hesap bilgisi (IBAN/ad/banka) yalnızca
 * bellekte tutulur (panel merchant API'si döndürmez) — o yüzden bellekten zenginleştirilir.
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

  const mem    = getTransaction(txId)           // hesap bilgisi (IBAN vb.)
  const remote = await apiGetTransactionStatus(txId)  // panel = durum kaynağı

  if (!mem && !remote) return NextResponse.json({ error: 'İşlem bulunamadı' }, { status: 404 })

  // Panel durumu esas; bellekteki hesap bilgisiyle birleştir
  return NextResponse.json({
    ...(mem ?? {}),
    ...(remote ?? {}),
    ibanWallet:  mem?.ibanWallet  ?? (remote as { ibanWallet?: string } | null)?.ibanWallet ?? '',
    accountName: mem?.accountName ?? '',
    bank:        mem?.bank        ?? '',
  })
}
