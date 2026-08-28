'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useClaimTransaction } from './use-transactions'

interface CountdownTimerProps {
  expiresAt: string
  onExpire: () => void
}

function CountdownTimer({ expiresAt, onExpire }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<number>(0)
  const onExpireRef = useRef(onExpire)
  const firedRef    = useRef(false)
  onExpireRef.current = onExpire

  useEffect(() => {
    firedRef.current = false
    const target = new Date(expiresAt).getTime()
    let id: ReturnType<typeof setInterval>
    const tick = () => {
      const left = Math.max(0, target - Date.now())
      setRemaining(left)
      if (left === 0 && !firedRef.current) {
        firedRef.current = true
        clearInterval(id)
        onExpireRef.current()
      }
    }
    tick()
    id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0')
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')

  if (remaining === 0) return <span className="text-sm text-muted-foreground">Süre doldu</span>
  return <span className="font-mono text-sm tabular-nums">{mm}:{ss}</span>
}

interface ClaimButtonProps {
  transactionId:  string
  status:         string
  claimExpiresAt: string | null
  claimedBy:      string | null
  currentUserId:  string
  onSuccess?:     () => void
}

export function ClaimButton({ transactionId, status, claimExpiresAt, claimedBy, currentUserId, onSuccess }: ClaimButtonProps) {
  const claim  = useClaimTransaction()
  const qc     = useQueryClient()
  const router = useRouter()

  if (status === 'PROCESSING' && claimedBy === currentUserId && claimExpiresAt) {
    return (
      <CountdownTimer
        expiresAt={claimExpiresAt}
        onExpire={() => {
          claim.reset()
          qc.invalidateQueries({ queryKey: ['transactions'] })
        }}
      />
    )
  }

  if (status === 'PROCESSING') {
    return <span className="text-xs text-muted-foreground">İşlemde</span>
  }

  if (status !== 'PENDING') return null

  return (
    <Button
      size="sm"
      disabled={claim.isPending}
      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
      onClick={() => claim.mutate(transactionId, {
        onSuccess: onSuccess ?? (() => router.push(`/transactions/${transactionId}`)),
      })}
    >
      {claim.isPending ? 'İşleme alınıyor...' : 'İşleme Al'}
    </Button>
  )
}
