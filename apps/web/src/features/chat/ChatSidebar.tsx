'use client'
import { useState } from 'react'
import { Hash, Lock, MessageSquare, Plus, ArrowLeftRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ChatConversation } from '@panel/types'
import { NewChannelDialog, NewDirectDialog } from './ChatDialogs'

function timeAgo(iso: string | null) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'az önce'
  if (diff < 3600) return `${Math.floor(diff / 60)} dk`
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa`
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
}

function Row({ c, active, onClick }: { c: ChatConversation; active: boolean; onClick: () => void }) {
  const Icon = c.type === 'direct' ? MessageSquare : c.type === 'transaction' ? ArrowLeftRight : c.isPrivate ? Lock : Hash
  return (
    <button
      onClick={onClick}
      className={[
        'w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60 text-foreground/90',
      ].join(' ')}
    >
      <Icon className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm ${c.unreadCount > 0 ? 'font-semibold' : ''}`}>{c.name}</span>
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{timeAgo(c.lastMessageAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {c.lastMessage ? `${c.lastMessage.sender ? c.lastMessage.sender + ': ' : ''}${c.lastMessage.content || '📎 ek'}` : 'Henüz mesaj yok'}
          </span>
          {c.unreadCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>
          )}
        </div>
      </div>
    </button>
  )
}

export function ChatSidebar({ conversations, activeId, onSelect }: {
  conversations: ChatConversation[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [newChannel, setNewChannel] = useState(false)
  const [newDirect, setNewDirect]   = useState(false)

  const filtered = q ? conversations.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : conversations
  const channels = filtered.filter((c) => c.type === 'channel')
  const directs  = filtered.filter((c) => c.type === 'direct')
  const txs      = filtered.filter((c) => c.type === 'transaction')

  const Section = ({ title, items, action }: { title: string; items: ChatConversation[]; action?: React.ReactNode }) => (
    <div className="space-y-0.5">
      <div className="flex items-center px-2 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className="ml-1 text-[10px] text-muted-foreground">({items.length})</span>
        <span className="ml-auto">{action}</span>
      </div>
      {items.length === 0 && <p className="px-2 text-xs text-muted-foreground/70">—</p>}
      {items.map((c) => <Row key={c.id} c={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />)}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
          <Input className="h-8 pl-7 text-xs" placeholder="Sohbet ara..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        <Section title="Kanallar" items={channels}
          action={<Button variant="ghost" size="icon" className="h-5 w-5" title="Yeni kanal" onClick={() => setNewChannel(true)}><Plus className="size-3" /></Button>} />
        <Section title="Kişiler" items={directs}
          action={<Button variant="ghost" size="icon" className="h-5 w-5" title="Yeni mesaj" onClick={() => setNewDirect(true)}><Plus className="size-3" /></Button>} />
        <Section title="İşlem Sohbetleri" items={txs} />
      </div>
      <NewChannelDialog open={newChannel} onClose={() => setNewChannel(false)} onCreated={onSelect} />
      <NewDirectDialog  open={newDirect}  onClose={() => setNewDirect(false)}  onCreated={onSelect} />
    </div>
  )
}
