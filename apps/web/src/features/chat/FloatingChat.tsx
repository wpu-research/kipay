'use client'
import { useEffect, useMemo, useState } from 'react'
import { MessageSquare, X, Minus, ChevronLeft, Hash, Lock, ArrowLeftRight } from 'lucide-react'
import type { ChatMessage } from '@panel/types'
import { useMe } from '@/features/auth/use-me'
import { sseClient } from '@/lib/sse-client'
import { playNotificationSound } from '@/lib/notification-sound'
import { useQueryClient } from '@tanstack/react-query'
import { ChatSidebar } from './ChatSidebar'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import {
  useConversations, useMessages, useMessageCache, useMarkRead, useChatUsers, useChatUnread,
} from './use-chat'

const LS_KEY = 'kipay-chat-open'

export function FloatingChat() {
  const { data: me } = useMe()
  const meId = me?.user.id ?? ''
  const isAdmin = ['tenant_admin', 'finans_admin'].includes(me?.user.role ?? '')
  const qc = useQueryClient()

  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)

  // Açık/kapalı durumunu hatırla
  useEffect(() => {
    try { setOpen(localStorage.getItem(LS_KEY) === '1') } catch { /* yoksa kapalı */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, open ? '1' : '0') } catch { /* sessiz */ }
  }, [open])

  const { data: unread } = useChatUnread()
  const { data: convData } = useConversations()
  const conversations = convData?.data ?? []
  const active = conversations.find((c) => c.id === activeId) ?? null
  const { data: usersData } = useChatUsers()
  const users = usersData?.data ?? []

  const messagesQ = useMessages(activeId)
  const messages = useMemo(() => (messagesQ.data?.pages ?? []).flatMap((p) => p.data), [messagesQ.data])
  const cache = useMessageCache()
  const markRead = useMarkRead()

  // Sohbet açılınca / yeni mesajda okundu işaretle
  useEffect(() => { if (open && activeId) { markRead.mutate(activeId); setReplyTo(null) } }, [activeId, open]) // eslint-disable-line react-hooks/exhaustive-deps
  const lastMsgId = messages[messages.length - 1]?.id
  useEffect(() => { if (open && activeId && lastMsgId) markRead.mutate(activeId) }, [lastMsgId]) // eslint-disable-line react-hooks/exhaustive-deps

  // SSE — canlı mesaj + okunmamış sayaç
  useEffect(() => {
    const onMsg = (d: unknown) => {
      const { message } = d as { message: ChatMessage }
      cache.upsert(message)
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })
      qc.invalidateQueries({ queryKey: ['chat', 'unread'] })
      if (message.sender?.id !== meId && (message.conversationId !== activeId || !open)) playNotificationSound()
    }
    const onUpd = (d: unknown) => cache.upsert((d as { message: ChatMessage }).message)
    const onDel = (d: unknown) => { const x = d as { conversationId: string; messageId: string }; cache.remove(x.conversationId, x.messageId) }
    const onConv = () => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    sseClient.on('chat.message', onMsg); sseClient.on('chat.message.updated', onUpd)
    sseClient.on('chat.message.deleted', onDel); sseClient.on('chat.conversation', onConv)
    return () => {
      sseClient.off('chat.message', onMsg); sseClient.off('chat.message.updated', onUpd)
      sseClient.off('chat.message.deleted', onDel); sseClient.off('chat.conversation', onConv)
    }
  }, [activeId, meId, open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null

  const HeaderIcon = active?.type === 'direct' ? MessageSquare : active?.type === 'transaction' ? ArrowLeftRight : active?.isPrivate ? Lock : Hash

  // Kapalı: sağ altta baloncuk
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90"
        title="Sohbet"
      >
        <MessageSquare className="size-6" />
        {!!unread && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    )
  }

  // Açık: yüzen kutu
  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[32rem] max-h-[calc(100vh-2.5rem)] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
      <header className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        {active ? (
          <>
            <button onClick={() => setActiveId(null)} className="rounded p-1 hover:bg-muted" title="Sohbet listesi"><ChevronLeft className="size-4" /></button>
            <HeaderIcon className="size-4 text-muted-foreground" />
            <span className="truncate text-sm font-semibold">{active.name}</span>
          </>
        ) : (
          <><MessageSquare className="size-4 text-muted-foreground" /><span className="text-sm font-semibold">Sohbet</span></>
        )}
        <button onClick={() => setOpen(false)} className="ml-auto rounded p-1 hover:bg-muted" title="Küçült"><Minus className="size-4" /></button>
        <button onClick={() => { setActiveId(null); setOpen(false) }} className="rounded p-1 hover:bg-muted" title="Kapat"><X className="size-4" /></button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {!active ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChatSidebar conversations={conversations} activeId={activeId} onSelect={setActiveId} />
          </div>
        ) : (
          <>
            <MessageList
              messages={messages} meId={meId} isAdmin={isAdmin}
              hasMore={!!messagesQ.hasNextPage} loadMore={() => messagesQ.fetchNextPage()} loadingMore={messagesQ.isFetchingNextPage}
              onReply={setReplyTo} typing={[]}
            />
            <Composer conversationId={active.id} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} users={users} onSent={(m) => cache.upsert(m)} />
          </>
        )}
      </div>
    </div>
  )
}
