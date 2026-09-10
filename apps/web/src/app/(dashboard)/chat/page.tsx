'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Hash, Lock, MessageSquare, ArrowLeftRight, UserPlus, LogOut, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useMe } from '@/features/auth/use-me'
import { sseClient } from '@/lib/sse-client'
import { playNotificationSound } from '@/lib/notification-sound'
import { useQueryClient } from '@tanstack/react-query'
import type { ChatMessage } from '@panel/types'
import { ChatSidebar } from '@/features/chat/ChatSidebar'
import { MessageList } from '@/features/chat/MessageList'
import { Composer } from '@/features/chat/Composer'
import { AddMembersDialog } from '@/features/chat/ChatDialogs'
import { useConversations, useMessages, useMessageCache, useMarkRead, useChatUsers, useCreateConversation, useRemoveMember } from '@/features/chat/use-chat'

function ChatPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const qc = useQueryClient()
  const { data: me } = useMe()
  const meId = me?.user.id ?? ''
  const isAdmin = ['tenant_admin', 'finans_admin'].includes(me?.user.role ?? '')

  const [activeId, setActiveId] = useState<string | null>(params.get('c'))
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({})

  const { data: convData } = useConversations()
  const conversations = convData?.data ?? []
  const active = conversations.find((c) => c.id === activeId) ?? null
  const { data: usersData } = useChatUsers()
  const users = usersData?.data ?? []

  const messagesQ = useMessages(activeId)
  const messages = useMemo(() => (messagesQ.data?.pages ?? []).flatMap((p) => p.data), [messagesQ.data])
  const cache = useMessageCache()
  const markRead = useMarkRead()
  const create = useCreateConversation()
  const removeMember = useRemoveMember(activeId ?? '')

  // ?tx=<id> → işlem sohbetini aç/oluştur
  const txParam = params.get('tx')
  const openedTx = useRef<string | null>(null)
  useEffect(() => {
    if (!txParam || openedTx.current === txParam) return
    openedTx.current = txParam
    create.mutateAsync({ type: 'transaction', transactionId: txParam })
      .then((r) => { setActiveId(r.data.id); router.replace(`/chat?c=${r.data.id}`) })
      .catch(() => toast.error('İşlem sohbeti açılamadı'))
  }, [txParam])  // eslint-disable-line react-hooks/exhaustive-deps

  // Aktif sohbet değişince okundu işaretle
  useEffect(() => {
    if (!activeId) return
    markRead.mutate(activeId)
    setReplyTo(null)
    router.replace(`/chat?c=${activeId}`)
  }, [activeId])  // eslint-disable-line react-hooks/exhaustive-deps

  // Son mesaj geldiğinde ve sohbet açıksa okundu yenile
  const lastMsgId = messages[messages.length - 1]?.id
  useEffect(() => { if (activeId && lastMsgId) markRead.mutate(activeId) }, [lastMsgId])  // eslint-disable-line react-hooks/exhaustive-deps

  // SSE
  useEffect(() => {
    const onMsg = (d: unknown) => {
      const { message } = d as { message: ChatMessage }
      cache.upsert(message)
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })
      if (message.sender?.id !== meId && message.conversationId !== activeId) playNotificationSound()
    }
    const onUpd = (d: unknown) => cache.upsert((d as { message: ChatMessage }).message)
    const onDel = (d: unknown) => { const x = d as { conversationId: string; messageId: string }; cache.remove(x.conversationId, x.messageId) }
    const onConv = () => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })
    const onTyping = (d: unknown) => {
      const x = d as { conversationId: string; userId: string; username: string }
      if (x.conversationId !== activeId || x.userId === meId) return
      setTyping((t) => ({ ...t, [x.userId]: { name: x.username, at: Date.now() } }))
    }
    sseClient.on('chat.message', onMsg); sseClient.on('chat.message.updated', onUpd); sseClient.on('chat.message.deleted', onDel)
    sseClient.on('chat.conversation', onConv); sseClient.on('chat.typing', onTyping)
    const iv = setInterval(() => setTyping((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => Date.now() - v.at < 4000))), 1000)
    return () => {
      sseClient.off('chat.message', onMsg); sseClient.off('chat.message.updated', onUpd); sseClient.off('chat.message.deleted', onDel)
      sseClient.off('chat.conversation', onConv); sseClient.off('chat.typing', onTyping); clearInterval(iv)
    }
  }, [activeId, meId])  // eslint-disable-line react-hooks/exhaustive-deps

  const HeaderIcon = active?.type === 'direct' ? MessageSquare : active?.type === 'transaction' ? ArrowLeftRight : active?.isPrivate ? Lock : Hash
  const canManage = active && active.type !== 'direct' && (isAdmin || active.isMember)

  return (
    <div className="flex h-[calc(100vh-7rem)] rounded-lg border bg-card overflow-hidden">
      <aside className="w-72 shrink-0 border-r hidden md:block">
        <ChatSidebar conversations={conversations} activeId={activeId} onSelect={setActiveId} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="size-8" />
            <p className="text-sm">Soldan bir sohbet seç ya da yeni kanal / mesaj başlat.</p>
            <div className="md:hidden w-full max-w-sm mt-4 border rounded-md">
              <ChatSidebar conversations={conversations} activeId={activeId} onSelect={setActiveId} />
            </div>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b px-3 py-2">
              <HeaderIcon className="size-4 text-muted-foreground" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{active.name}</h2>
                <p className="truncate text-[11px] text-muted-foreground">
                  {active.type === 'direct' ? 'Kişiye özel'
                    : active.type === 'transaction' ? 'İşlem sohbeti · tüm ekip görür'
                    : `${active.isPrivate ? 'Özel kanal' : 'Genel kanal'} · ${active.members.length} üye${active.members.length ? ': ' + active.members.map((m) => '@' + m.username).slice(0, 6).join(', ') : ''}${active.members.length > 6 ? '…' : ''}`}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1">
                {active.type === 'transaction' && active.transactionId && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => router.push(`/transactions?tx=${active.transactionId}`)}>
                    <ExternalLink className="size-3" /> İşleme git
                  </Button>
                )}
                {canManage && active.type === 'channel' && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Üye ekle" onClick={() => setAddOpen(true)}><UserPlus className="size-4" /></Button>
                )}
                {active.type === 'channel' && active.isMember && active.name.toLowerCase() !== 'genel' && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Kanaldan ayrıl"
                          onClick={() => removeMember.mutateAsync(meId).then(() => { toast.success('Kanaldan ayrıldın'); if (active.isPrivate) setActiveId(null) }).catch(() => toast.error('Ayrılamadı'))}>
                    <LogOut className="size-4" />
                  </Button>
                )}
              </div>
            </header>

            <MessageList
              messages={messages} meId={meId} isAdmin={isAdmin}
              hasMore={!!messagesQ.hasNextPage} loadMore={() => messagesQ.fetchNextPage()} loadingMore={messagesQ.isFetchingNextPage}
              onReply={setReplyTo}
              typing={Object.values(typing).map((t) => t.name)}
            />

            <Composer conversationId={active.id} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} users={users} onSent={(m) => cache.upsert(m)} />

            {active.type === 'channel' && (
              <AddMembersDialog open={addOpen} onClose={() => setAddOpen(false)} conversationId={active.id} existing={active.members.map((m) => m.id)} />
            )}
          </>
        )}
      </section>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
      <ChatPageInner />
    </Suspense>
  )
}
