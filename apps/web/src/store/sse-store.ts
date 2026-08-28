import { create } from 'zustand'
import { sseClient } from '@/lib/sse-client'
import type { ConnectionStatus } from '@/lib/sse-client'

interface SseState {
  // P01: AC4 uyumlu alan adı — 'status' yerine 'connectionStatus'
  connectionStatus: ConnectionStatus
  retryCount: number
  connect: (url: string) => void
  disconnect: () => void
}

export const useSseStore = create<SseState>(() => ({
  connectionStatus: 'disconnected',
  retryCount: 0,

  connect: (url: string) => {
    sseClient.connect(url)
  },

  disconnect: () => {
    sseClient.disconnect()
  },
}))

// P07: Status callback modül yüklendiğinde bir kez kaydedilir (her connect() çağrısında değil)
// P08: retryCount sseClient'tan tek kaynaktan gelir — store bağımsız sayaç tutmaz
sseClient.addStatusCallback((status, retryCount) => {
  useSseStore.setState({ connectionStatus: status, retryCount })
})
