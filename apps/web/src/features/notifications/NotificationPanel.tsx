'use client'
import { useRouter } from 'next/navigation'
import { CheckCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useNotifications, useMarkNotificationRead, useMarkAllRead } from './use-notifications'
import type { NotificationType } from '@panel/types'

interface Props {
  onClose: () => void
}

export function NotificationPanel({ onClose }: Props) {
  const router      = useRouter()
  const { data, isLoading } = useNotifications()
  const markRead    = useMarkNotificationRead()
  const markAllRead = useMarkAllRead()

  function handleNotificationClick(n: NotificationType) {
    if (!n.isRead) markRead.mutate(n.id)
    onClose()
    router.push(`/transactions/${n.payload.txId}`)
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Bildirimler</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-3 w-3" />
            Tümünü okundu işaretle
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-80">
          {isLoading && (
            <div className="p-4 text-center text-sm text-muted-foreground">Yükleniyor...</div>
          )}
          {!isLoading && (!data?.data || data.data.length === 0) && (
            <div className="p-4 text-center text-sm text-muted-foreground">Bildirim yok</div>
          )}
          {data?.data.map((n: NotificationType) => (
            <div
              key={n.id}
              className={`cursor-pointer border-b px-4 py-3 transition-colors hover:bg-muted/50 ${
                n.isRead ? 'opacity-60' : 'bg-muted/20'
              }`}
              onClick={() => handleNotificationClick(n)}
            >
              <p className="text-sm font-medium">
                {n.payload.merchantName
                  ? `Yeni işlem — ${n.payload.merchantName}`
                  : 'Yeni işlem bildirimi'}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(n.createdAt).toLocaleString('tr-TR')}
              </p>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
