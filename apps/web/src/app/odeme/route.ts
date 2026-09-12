/**
 * GET /odeme — ödeme sayfası.
 * HTML gömülü modülden gelir (bkz. odeme-html.ts — public/ standalone build'e girmiyor).
 */
import { ODEME_HTML } from './odeme-html'

export const runtime = 'nodejs'
export const dynamic = 'force-static'

export async function GET() {
  return new Response(ODEME_HTML, {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
