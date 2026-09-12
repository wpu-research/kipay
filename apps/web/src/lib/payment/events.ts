/**
 * SSE client store — panel webhook gelince /api/events/:userId dinleyicilerine push eder.
 * apps/gateway/src/routes/events.ts'den taşındı.
 */

interface SseClient {
  id:     string
  userId: string
  send:   (data: object) => void
}

const g = globalThis as unknown as { __kipaySse?: Map<string, SseClient[]> }
const sseClients: Map<string, SseClient[]> = (g.__kipaySse ??= new Map())

export function addSseClient(userId: string, client: SseClient) {
  if (!sseClients.has(userId)) sseClients.set(userId, [])
  sseClients.get(userId)!.push(client)
}

export function removeSseClient(userId: string, id: string) {
  const arr = sseClients.get(userId)
  if (!arr) return
  const idx = arr.findIndex(c => c.id === id)
  if (idx >= 0) arr.splice(idx, 1)
  if (arr.length === 0) sseClients.delete(userId)
}

export function sseNotify(userId: string, data: object) {
  const clients = sseClients.get(userId) ?? []
  const dead: SseClient[] = []
  for (const client of clients) {
    try { client.send(data) } catch { dead.push(client) }
  }
  for (const d of dead) removeSseClient(userId, d.id)
}
