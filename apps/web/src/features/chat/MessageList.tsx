'use client'
import { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2, Reply, Download, FileText, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ChatMessage } from '@panel/types'
import { attachmentUrl, downloadAttachment, useDeleteMessage, useEditMessage } from './use-chat'

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
const fmtDay  = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { weekday: 'long', day: '2-digit', month: 'long' })
const dayKey  = (iso: string) => new Date(iso).toDateString()
const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)

/** @mention ve URL'leri vurgula */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(@[a-z0-9_-]{3,64}|https?:\/\/\S+)/gi)
  return (
    <>
      {parts.map((p, i) => {
        if (/^@/.test(p)) return <span key={i} className="rounded bg-primary/15 px-1 text-primary font-medium">{p}</span>
        if (/^https?:\/\//i.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className="underline text-primary break-all">{p}</a>
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

function Attachments({ items }: { items: ChatMessage['attachments'] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {items.map((a) => a.mime.startsWith('image/') ? (
        <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="block">
          {/* cookie auth: CORS credentials ile yükle */}
          <img src={attachmentUrl(a.id)} alt={a.name} crossOrigin="use-credentials" loading="lazy"
               className="max-h-64 max-w-xs rounded-md border object-contain bg-muted/30" />
        </a>
      ) : (
        <button key={a.id} onClick={() => downloadAttachment(a).catch(() => toast.error('İndirilemedi'))}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs hover:bg-muted">
          <FileText className="size-4 text-muted-foreground" />
          <span className="max-w-[180px] truncate">{a.name}</span>
          <span className="text-muted-foreground">{fmtSize(a.size)}</span>
          <Download className="size-3 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

function Bubble({ m, mine, isAdmin, onReply, onJump }: {
  m: ChatMessage; mine: boolean; isAdmin: boolean; onReply: (m: ChatMessage) => void; onJump: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.content)
  const [confirmDel, setConfirmDel] = useState(false)
  const edit = useEditMessage()
  const del  = useDeleteMessage()

  if (m.isSystem) {
    return <div className="my-1 text-center text-[11px] text-muted-foreground italic">{m.content} · {fmtTime(m.createdAt)}</div>
  }

  async function saveEdit() {
    if (!draft.trim() || draft.trim() === m.content) { setEditing(false); return }
    try { await edit.mutateAsync({ id: m.id, content: draft.trim() }); setEditing(false) }
    catch { toast.error('Düzenlenemedi') }
  }
  async function doDelete() {
    try { await del.mutateAsync(m.id); setConfirmDel(false) } catch { toast.error('Silinemedi') }
  }

  return (
    <div id={`msg-${m.id}`} className={`group flex gap-2 px-3 py-1 hover:bg-muted/30 ${mine ? 'flex-row-reverse' : ''}`}>
      <div className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        {(m.sender?.username ?? '?').slice(0, 2)}
      </div>
      <div className={`min-w-0 max-w-[75%] ${mine ? 'text-right' : ''}`}>
        <div className={`flex items-baseline gap-2 text-xs ${mine ? 'justify-end' : ''}`}>
          <span className="font-semibold">{m.sender?.username ?? 'Silinmiş kullanıcı'}</span>
          <span className="text-muted-foreground">{fmtTime(m.createdAt)}</span>
          {m.editedAt && !m.deletedAt && <span className="text-[10px] text-muted-foreground">(düzenlendi)</span>}
        </div>

        {m.replyTo && (
          <button onClick={() => onJump(m.replyTo!.id)} className={`mt-0.5 block max-w-full truncate rounded border-l-2 border-primary/50 bg-muted/40 px-2 py-0.5 text-left text-[11px] text-muted-foreground ${mine ? 'ml-auto' : ''}`}>
            <span className="font-medium">{m.replyTo.sender?.username ?? '?'}:</span> {m.replyTo.content || '(silindi)'}
          </button>
        )}

        {m.deletedAt ? (
          <p className="mt-0.5 text-sm italic text-muted-foreground">Bu mesaj silindi.</p>
        ) : editing ? (
          <div className="mt-1 space-y-1 text-left">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[60px] text-sm"
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } if (e.key === 'Escape') setEditing(false) }} autoFocus />
            <div className="flex gap-1">
              <Button size="sm" className="h-6 text-xs" onClick={saveEdit}><Check className="size-3" /> Kaydet</Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setEditing(false); setDraft(m.content) }}><X className="size-3" /> İptal</Button>
            </div>
          </div>
        ) : (
          <div className={`mt-0.5 inline-block rounded-lg px-3 py-1.5 text-sm text-left whitespace-pre-wrap break-words ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            {m.content && <RichText text={m.content} />}
            <Attachments items={m.attachments} />
          </div>
        )}
      </div>

      {!m.deletedAt && !editing && (
        <div className="flex items-start gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Yanıtla" onClick={() => onReply(m)}><Reply className="size-3" /></Button>
          {mine && <Button variant="ghost" size="icon" className="h-6 w-6" title="Düzenle" onClick={() => { setDraft(m.content); setEditing(true) }}><Pencil className="size-3" /></Button>}
          {(mine || isAdmin) && (
            confirmDel
              ? <Button variant="destructive" size="sm" className="h-6 text-[10px]" onClick={doDelete}>Sil?</Button>
              : <Button variant="ghost" size="icon" className="h-6 w-6" title="Sil" onClick={() => { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000) }}><Trash2 className="size-3" /></Button>
          )}
        </div>
      )}
    </div>
  )
}

export function MessageList({ messages, meId, isAdmin, hasMore, loadMore, loadingMore, onReply, typing }: {
  messages: ChatMessage[]; meId: string; isAdmin: boolean
  hasMore: boolean; loadMore: () => void; loadingMore: boolean
  onReply: (m: ChatMessage) => void
  typing: string[]
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastId = messages[messages.length - 1]?.id

  // Kullanıcı en alttaysa yeni mesajda kaydır
  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [lastId, typing.length])

  function onScroll() {
    const el = boxRef.current; if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 40 && hasMore && !loadingMore) {
      const prevH = el.scrollHeight
      loadMore()
      requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - prevH })
    }
  }

  function jump(id: string) {
    const el = document.getElementById(`msg-${id}`)
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('bg-primary/10'); setTimeout(() => el.classList.remove('bg-primary/10'), 1200) }
  }

  return (
    <div ref={boxRef} onScroll={onScroll} className="flex-1 overflow-y-auto py-2">
      {hasMore && (
        <div className="text-center py-1">
          <Button variant="ghost" size="sm" className="text-xs h-6" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Yükleniyor...' : 'Daha eski mesajlar'}</Button>
        </div>
      )}
      {messages.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Henüz mesaj yok. İlk mesajı sen yaz.</p>}
      {messages.map((m, i) => {
        const showDay = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(m.createdAt)
        return (
          <div key={m.id}>
            {showDay && (
              <div className="my-2 flex items-center gap-2 px-3">
                <div className="h-px flex-1 bg-border" /><span className="text-[10px] text-muted-foreground">{fmtDay(m.createdAt)}</span><div className="h-px flex-1 bg-border" />
              </div>
            )}
            <Bubble m={m} mine={m.sender?.id === meId} isAdmin={isAdmin} onReply={onReply} onJump={jump} />
          </div>
        )
      })}
      {typing.length > 0 && <p className="px-4 pt-1 text-[11px] text-muted-foreground italic">{typing.join(', ')} yazıyor…</p>}
      <div ref={bottomRef} />
    </div>
  )
}
