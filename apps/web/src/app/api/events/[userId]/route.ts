/**
 * GET /api/events/:userId — SSE. Panel webhook gelince APPROVED/REJECTED push'lar.
 * apps/gateway/src/routes/events.ts'den taşındı.
 */
import { randomUUID } from 'crypto'
import { addSseClient, removeSseClient } from '@/lib/payment/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const id = randomUUID()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)) } catch { /* kapanmış */ }
      }

      write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`)
      addSseClient(userId, { id, userId, send: (data) => write(`data: ${JSON.stringify(data)}\n\n`) })

      const ping = setInterval(() => write(': ping\n\n'), 25000)

      request.signal.addEventListener('abort', () => {
        clearInterval(ping)
        removeSseClient(userId, id)
        try { controller.close() } catch { /* zaten kapalı */ }
      })
    },
    cancel() {
      removeSseClient(userId, id)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection:          'keep-alive',
    },
  })
}
