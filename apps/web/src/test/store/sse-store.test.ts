import { describe, it, expect, vi, beforeEach } from 'vitest'

// sseClient mock — addStatusCallback/removeStatusCallback'e güncellendi (P07)
vi.mock('@/lib/sse-client', () => ({
  sseClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    addStatusCallback: vi.fn(),
    removeStatusCallback: vi.fn(),
  },
}))

describe('useSseStore', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  // P01: Alan adı connectionStatus olmalı (status değil)
  it('başlangıç durumu: connectionStatus disconnected ve retryCount 0', async () => {
    const { useSseStore } = await import('@/store/sse-store')
    const state = useSseStore.getState()
    expect(state.connectionStatus).toBe('disconnected')
    expect(state.retryCount).toBe(0)
  })

  it('connect aksiyonu sseClient.connect çağırır', async () => {
    const { sseClient } = await import('@/lib/sse-client')
    const { useSseStore } = await import('@/store/sse-store')
    useSseStore.getState().connect('http://localhost:3000/sse')
    expect(sseClient.connect).toHaveBeenCalledWith('http://localhost:3000/sse')
  })

  it('disconnect aksiyonu sseClient.disconnect çağırır', async () => {
    const { sseClient } = await import('@/lib/sse-client')
    const { useSseStore } = await import('@/store/sse-store')
    useSseStore.getState().disconnect()
    expect(sseClient.disconnect).toHaveBeenCalled()
  })

  it('connect() ve disconnect() aksiyonları tanımlı', async () => {
    const { useSseStore } = await import('@/store/sse-store')
    const state = useSseStore.getState()
    expect(typeof state.connect).toBe('function')
    expect(typeof state.disconnect).toBe('function')
  })

  // P07: addStatusCallback modül yüklendiğinde bir kez kaydedilir
  it('modül yüklendiğinde addStatusCallback sseClient\'a kaydedilir', async () => {
    const { sseClient } = await import('@/lib/sse-client')
    await import('@/store/sse-store')
    expect(sseClient.addStatusCallback).toHaveBeenCalled()
  })

  // P08: Status callback connectionStatus ve retryCount günceller
  it('status callback connectionStatus ve retryCount günceller', async () => {
    const { sseClient } = await import('@/lib/sse-client')

    // addStatusCallback callback'ini store yüklenmeden önce yakala
    type StatusCb = Parameters<typeof sseClient.addStatusCallback>[0]
    let capturedCb: StatusCb | null = null
    vi.mocked(sseClient.addStatusCallback).mockImplementation((cb) => { capturedCb = cb })

    const { useSseStore } = await import('@/store/sse-store')
    expect(capturedCb).not.toBeNull()

    // 'reconnecting' durumunu simüle et
    capturedCb!('reconnecting', 2)
    expect(useSseStore.getState().connectionStatus).toBe('reconnecting')
    expect(useSseStore.getState().retryCount).toBe(2)

    // 'connected' durumunu simüle et
    capturedCb!('connected', 0)
    expect(useSseStore.getState().connectionStatus).toBe('connected')
    expect(useSseStore.getState().retryCount).toBe(0)
  })

  // P02: warn_user durumu store'da takip edilebilir
  it('warn_user durumu connectionStatus\'ta görünür', async () => {
    const { sseClient } = await import('@/lib/sse-client')

    type StatusCb = Parameters<typeof sseClient.addStatusCallback>[0]
    let capturedCb: StatusCb | null = null
    vi.mocked(sseClient.addStatusCallback).mockImplementation((cb) => { capturedCb = cb })

    const { useSseStore } = await import('@/store/sse-store')
    expect(capturedCb).not.toBeNull()

    capturedCb!('warn_user', 5)
    expect(useSseStore.getState().connectionStatus).toBe('warn_user')
    expect(useSseStore.getState().retryCount).toBe(5)
  })
})
