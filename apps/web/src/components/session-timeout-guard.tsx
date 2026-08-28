'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

// Access token süresi 15 dakika; 2 dakika kala uyarı göster
const SESSION_DURATION_MS = 15 * 60 * 1000
const WARNING_BEFORE_MS   =  2 * 60 * 1000

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export function SessionTimeoutGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [showWarning, setShowWarning] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(WARNING_BEFORE_MS / 1000)
  const startTimeRef = useRef(Date.now())
  const [extending, setExtending] = useState(false)

  const resetTimer = useCallback(() => {
    startTimeRef.current = Date.now()
    setShowWarning(false)
    setRemainingSeconds(WARNING_BEFORE_MS / 1000)
  }, [])

  // api-client'tan gelen refresh sinyalini dinle
  useEffect(() => {
    const handler = () => resetTimer()
    window.addEventListener('session:refreshed', handler)
    return () => window.removeEventListener('session:refreshed', handler)
  }, [resetTimer])

  // Geri sayım tick'i
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const remaining = SESSION_DURATION_MS - elapsed

      if (remaining <= 0) {
        clearInterval(interval)
        router.push('/login')
        return
      }

      if (remaining <= WARNING_BEFORE_MS) {
        setShowWarning(true)
        setRemainingSeconds(Math.ceil(remaining / 1000))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [router])

  const handleExtend = useCallback(async () => {
    setExtending(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        resetTimer()
        window.dispatchEvent(new Event('session:refreshed'))
      } else {
        router.push('/login')
      }
    } catch {
      router.push('/login')
    } finally {
      setExtending(false)
    }
  }, [resetTimer, router])

  const handleLogout = useCallback(() => {
    router.push('/login')
  }, [router])

  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const countdownText = minutes > 0
    ? `${minutes} dakika ${seconds} saniye`
    : `${seconds} saniye`

  return (
    <>
      {children}
      <AlertDialog open={showWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Oturumunuz sona eriyor</AlertDialogTitle>
            <AlertDialogDescription>
              Oturumunuz <span className="font-semibold text-foreground">{countdownText}</span> içinde
              sona erecek. Devam etmek istiyor musunuz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleLogout}>
              Çıkış Yap
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleExtend} disabled={extending}>
              {extending ? 'Yenileniyor…' : 'Devam Et'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
