'use client'
import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUnreadCount } from './use-notifications'
import { NotificationPanel } from './NotificationPanel'

interface NotificationBellProps {
  align?: 'left' | 'right'
}

export function NotificationBell({ align = 'right' }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const { data: unreadCount = 0 } = useUnreadCount()

  const displayCount = unreadCount > 99 ? '99+' : unreadCount

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Bildirimler"
        className="h-7 w-7"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-medium text-destructive-foreground">
            {displayCount}
          </span>
        )}
      </Button>

      {open && (
        <div className={`absolute top-8 z-50 w-80 ${align === 'left' ? 'left-0' : 'right-0'}`}>
          <NotificationPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
