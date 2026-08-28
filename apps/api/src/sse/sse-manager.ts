import type { ServerResponse } from 'node:http'

// tenantId → userId → Set<ServerResponse>
const connections = new Map<string, Map<string, Set<ServerResponse>>>()

export function addConnection(tenantId: string, userId: string, res: ServerResponse): void {
  if (!connections.has(tenantId)) connections.set(tenantId, new Map())
  const tenantMap = connections.get(tenantId)!
  if (!tenantMap.has(userId)) tenantMap.set(userId, new Set())
  tenantMap.get(userId)!.add(res)
}

export function removeConnection(tenantId: string, userId: string, res: ServerResponse): void {
  connections.get(tenantId)?.get(userId)?.delete(res)
}

export function emitToTenant(tenantId: string, event: string, data: unknown): void {
  const tenantMap = connections.get(tenantId)
  const connCount = getConnectionCount(tenantId)
  console.log(`[sse-manager] emitToTenant event=${event} tenantId=${tenantId} connections=${connCount}`)
  if (!tenantMap) return
  void event  // parameter kept for call-site clarity / future use
  const payload = `data: ${JSON.stringify(data)}\n\n`
  for (const userConns of tenantMap.values()) {
    for (const res of userConns) {
      try { res.write(payload) } catch { /* bağlantı kapalı */ }
    }
  }
}

export function emitToUser(tenantId: string, userId: string, data: unknown): void {
  const userConns = connections.get(tenantId)?.get(userId)
  if (!userConns || userConns.size === 0) return
  const payload = `data: ${JSON.stringify(data)}\n\n`
  for (const res of userConns) {
    try { res.write(payload) } catch { /* bağlantı kapalı */ }
  }
}

export function getConnectionCount(tenantId: string): number {
  const tenantMap = connections.get(tenantId)
  if (!tenantMap) return 0
  let count = 0
  for (const userConns of tenantMap.values()) count += userConns.size
  return count
}
