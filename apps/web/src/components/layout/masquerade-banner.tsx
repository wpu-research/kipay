'use client'
import { useMasqueradeExit } from '@/features/auth/use-masquerade'

interface MasqueradeBannerProps {
  targetUsername: string
}

export function MasqueradeBanner({ targetUsername }: MasqueradeBannerProps) {
  const exitMasquerade = useMasqueradeExit()

  return (
    <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        <span>
          Masquerade aktif —{' '}
          <span className="font-semibold">{targetUsername}</span>{' '}
          olarak görüntülüyorsunuz
        </span>
      </div>
      <button
        onClick={() => exitMasquerade.mutate()}
        disabled={exitMasquerade.isPending}
        className="rounded px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-900/30"
      >
        {exitMasquerade.isPending ? 'Çıkılıyor…' : 'Çıkış'}
      </button>
    </div>
  )
}
