let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export function playNotificationSound(): void {
  const audioCtx = getCtx()
  if (!audioCtx) return

  // AudioContext kullanıcı etkileşimi olmadan suspend edilebilir
  const resume = audioCtx.state === 'suspended' ? audioCtx.resume() : Promise.resolve()

  resume.then(() => {
    const now = audioCtx.currentTime

    // İki kısa ding — 880 Hz → 1100 Hz
    const freqs = [880, 1100]
    freqs.forEach((freq, i) => {
      const osc   = audioCtx.createOscillator()
      const gain  = audioCtx.createGain()

      osc.connect(gain)
      gain.connect(audioCtx.destination)

      osc.type      = 'sine'
      osc.frequency.value = freq

      const start = now + i * 0.15
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.3, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2)

      osc.start(start)
      osc.stop(start + 0.2)
    })
  }).catch(() => {})
}
