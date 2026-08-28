'use client'
import { useEffect } from 'react'
import { sseClient } from '@/lib/sse-client'
import { useSseStore } from '@/store/sse-store'
import { useQueryClient } from '@tanstack/react-query'
import { playNotificationSound } from '@/lib/notification-sound'

export function SseProvider({ children }: { children: React.ReactNode }) {
  const { connect, disconnect } = useSseStore()
  const queryClient = useQueryClient()

  useEffect(() => {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
    connect(`${apiBase}/api/v1/notifications/sse`)

    const onNotification = () => {
      playNotificationSound()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
    const onTransaction = () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }

    sseClient.on('transaction.pending', onNotification)
    sseClient.on('transaction.pending', onTransaction)
    sseClient.on('transaction.claimed', onTransaction)

    return () => {
      sseClient.off('transaction.pending', onNotification)
      sseClient.off('transaction.pending', onTransaction)
      sseClient.off('transaction.claimed', onTransaction)
      disconnect()
    }
  }, [connect, disconnect, queryClient])

  return <>{children}</>
}
