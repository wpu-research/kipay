type EventCallback = (data: unknown) => void

// P02: 'warn_user' eklendi — 5 denemeden sonra UI'a uyarı sinyali
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting' | 'warn_user'

// P08: Callback'e retryCount da geçilir — store bağımsız sayaç tutmaz
type StatusCallback = (status: ConnectionStatus, retryCount: number) => void

class SseClient {
  private eventSource: EventSource | null = null
  private listeners = new Map<string, EventCallback[]>()
  private retryCount = 0
  private readonly maxRetries = 5
  private readonly retryDelay = 3_000       // 3 saniye — ilk 5 denemede
  private readonly backgroundDelay = 30_000 // 30 saniye — sonrasında
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private currentUrl: string | null = null
  // P07: Tek callback yerine Set — birden fazla subscriber desteklenir
  private statusCallbacks = new Set<StatusCallback>()
  // P05: connectionId ile terk edilmiş handler'lar geçersizleştirilir
  private connectionId = 0

  // P07: setStatusCallback → addStatusCallback / removeStatusCallback
  addStatusCallback(cb: StatusCallback) {
    this.statusCallbacks.add(cb)
  }

  removeStatusCallback(cb: StatusCallback) {
    this.statusCallbacks.delete(cb)
  }

  private notifyStatus(status: ConnectionStatus) {
    this.statusCallbacks.forEach((cb) => cb(status, this.retryCount))
  }

  connect(url: string) {
    // P09: SSR guard — EventSource tarayıcıya özgüdür
    if (typeof EventSource === 'undefined') return

    // P04: connect() çağrıldığında bekleyen retry timer'ı temizle
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }

    // P03: CONNECTING (0) durumundaki bağlantıyı da koru — sadece CLOSED ise yeniden bağlan
    if (this.eventSource !== null && this.eventSource.readyState !== EventSource.CLOSED) return

    this.currentUrl = url
    // P05: Yeni connectionId — eski handler'lar bu ID'yi taşımaz, stale kontrolü yapar
    const id = ++this.connectionId
    const es = new EventSource(url, { withCredentials: true })
    this.eventSource = es

    es.onopen = () => {
      if (id !== this.connectionId) return // stale handler — yoksay
      this.retryCount = 0
      this.notifyStatus('connected')
    }

    es.onerror = () => {
      if (id !== this.connectionId) return // stale handler — yoksay (P05)
      es.close()
      if (this.eventSource === es) this.eventSource = null
      this.scheduleReconnect()
    }

    es.onmessage = (event) => {
      if (id !== this.connectionId) return // stale handler — yoksay
      try {
        const parsed = JSON.parse(event.data as string) as { type: string }
        this.emit(parsed.type, parsed)
      } catch {
        // malformed event — yoksay
      }
    }
  }

  private scheduleReconnect() {
    if (!this.currentUrl) return
    if (this.retryTimer) clearTimeout(this.retryTimer)

    const isBackground = this.retryCount >= this.maxRetries
    const delay = isBackground ? this.backgroundDelay : this.retryDelay

    // P02: 5 deneme aşıldığında 'warn_user' — UI banner/toast gösterebilir
    this.notifyStatus(isBackground ? 'warn_user' : 'reconnecting')
    this.retryCount++

    const url = this.currentUrl
    this.retryTimer = setTimeout(() => this.connect(url), delay)
  }

  on(event: string, callback: EventCallback) {
    const existing = this.listeners.get(event) ?? []
    // P06: Aynı callback'i tekrar kaydetme — deduplication
    if (existing.includes(callback)) return
    this.listeners.set(event, [...existing, callback])
  }

  off(event: string, callback: EventCallback) {
    const existing = this.listeners.get(event) ?? []
    this.listeners.set(event, existing.filter((cb) => cb !== callback))
  }

  private emit(event: string, data: unknown) {
    this.listeners.get(event)?.forEach((cb) => cb(data))
  }

  disconnect() {
    // P05: Yeni connectionId — mevcut handler'lar artık stale
    const id = ++this.connectionId
    void id // kullanılmadı uyarısını önle — amacı stale invalidation

    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.currentUrl = null
    this.retryCount = 0
    this.notifyStatus('disconnected')
  }
}

export const sseClient = new SseClient()
