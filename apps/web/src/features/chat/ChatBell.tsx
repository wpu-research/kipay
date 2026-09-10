'use client'
import { MessageSquare } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useChatUnread } from './use-chat'

export function ChatBell() {
  const router = useRouter()
  const pathname = usePathname()
  const { data: unread = 0 } = useChatUnread()
  const display = unread > 99 ? '99+' : unread
  return (
    <Button variant="ghost" size="icon" className="relative h-7 w-7" aria-label="Sohbet" title="Sohbet"
            onClick={() => { if (!pathname.startsWith('/chat')) router.push('/chat') }}>
      <MessageSquare className="h-4 w-4" />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-medium text-primary-foreground">{display}</span>
      )}
    </Button>
  )
}
