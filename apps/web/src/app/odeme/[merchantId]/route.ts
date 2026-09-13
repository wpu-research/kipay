/**
 * GET /odeme/:merchantId — merchant'a özel ödeme sayfası.
 *
 * Her merchant'a verilecek link budur; sayfa merchant_id'yi URL'den alır, ziyaretçinin
 * query string ile değiştirmesine gerek kalmaz. Tanımsız merchant için 404 döner
 * (merchant listesi env'deki MERCHANT_1..20'den gelir).
 */
import { MERCHANT_CREDS } from '@/lib/payment/env'
import { ODEME_HTML } from '../odeme-html'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** HTML'e gömülecek değerde </script> ve tırnak kaçışı. */
function jsString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export async function GET(_request: Request, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params

  if (!MERCHANT_CREDS.has(merchantId)) {
    return new Response('Ödeme sayfası bulunamadı.', {
      status:  404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  // Widget script'i çalışmadan önce merchant_id'yi tanımla (bkz. odeme.html: _urlMerchant).
  const inject = `<script>window.__KIPAY_MERCHANT_ID=${jsString(merchantId)}</script>`
  const html = ODEME_HTML.replace('</head>', `${inject}\n</head>`)

  return new Response(html, {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
