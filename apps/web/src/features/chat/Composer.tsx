'use client'
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Paperclip, Send, X, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ChatMessage, ChatAttachmentMeta, ChatUser } from '@panel/types'
import { useSendMessage, useUploadAttachment, useTyping } from './use-chat'
import { ApiError } from '@/lib/api-client'

export function Composer({ conversationId, replyTo, onCancelReply, users, onSent }: {
  conversationId: string
  replyTo: ChatMessage | null
  onCancelReply: () => void
  users: ChatUser[]
  onSent: (m: ChatMessage) => void
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<ChatAttachmentMeta[]>([])
  const [uploading, setUploading] = useState(0)
  const [mentionQ, setMentionQ] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastTyping = useRef(0)

  const send   = useSendMessage(conversationId)
  const upload = useUploadAttachment()
  const typing = useTyping(conversationId)

  async function addFiles(list: FileList | File[]) {
    for (const f of Array.from(list)) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name}: 10 MB sınırı`); continue }
      setUploading((n) => n + 1)
      try { const meta = await upload.mutateAsync(f); setFiles((p) => [...p, meta]) }
      catch (e) { toast.error(e instanceof ApiError ? e.message : `${f.name} yüklenemedi`) }
      finally { setUploading((n) => n - 1) }
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items).filter((i) => i.kind === 'file')
    if (items.length === 0) return
    e.preventDefault()
    const fs = items.map((i) => i.getAsFile()).filter(Boolean) as File[]
    // Yapıştırılan ekran görüntüsünün adı yoktur → zaman damgalı isim ver
    addFiles(fs.map((f) => (f.name && f.name !== 'image.png') ? f : new File([f], `ekran-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, { type: f.type })))
  }

  async function submit() {
    const content = text.trim()
    if (!content && files.length === 0) return
    if (uploading > 0) { toast.info('Dosyalar yükleniyor, bekleyin'); return }
    try {
      const res = await send.mutateAsync({ content, attachmentIds: files.map((f) => f.id), replyToId: replyTo?.id ?? null })
      onSent(res.data)
      setText(''); setFiles([]); onCancelReply(); setMentionQ(null)
      taRef.current?.focus()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Gönderilemedi') }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQ !== null && mentionOptions.length > 0 && (e.key === 'Tab' || e.key === 'Enter')) {
      e.preventDefault(); pickMention(mentionOptions[0].username); return
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    if (e.key === 'Escape') { onCancelReply(); setMentionQ(null) }
  }

  function onChange(v: string) {
    setText(v)
    const m = /(^|\s)@([a-z0-9_-]*)$/i.exec(v.slice(0, taRef.current?.selectionStart ?? v.length))
    setMentionQ(m ? m[2].toLowerCase() : null)
    const now = Date.now()
    if (now - lastTyping.current > 3000) { lastTyping.current = now; typing.mutate() }
  }

  const mentionOptions = mentionQ === null ? [] : users.filter((u) => u.username.toLowerCase().startsWith(mentionQ)).slice(0, 6)
  function pickMention(username: string) {
    setText((t) => t.replace(/@[a-z0-9_-]*$/i, `@${username} `))
    setMentionQ(null); taRef.current?.focus()
  }

  return (
    <div className="border-t p-2 space-y-2"
         onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}>
      {replyTo && (
        <div className="flex items-center gap-2 rounded border-l-2 border-primary/60 bg-muted/40 px-2 py-1 text-xs">
          <span className="text-muted-foreground">Yanıt:</span>
          <span className="font-medium">{replyTo.sender?.username}</span>
          <span className="truncate text-muted-foreground">{replyTo.content || '📎 ek'}</span>
          <Button variant="ghost" size="icon" className="ml-auto h-5 w-5" onClick={onCancelReply}><X className="size-3" /></Button>
        </div>
      )}
      {(files.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <span key={f.id} className="flex items-center gap-1 rounded border bg-muted/40 px-2 py-1 text-xs">
              <FileText className="size-3" /><span className="max-w-[140px] truncate">{f.name}</span>
              <button onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}><X className="size-3" /></button>
            </span>
          ))}
          {uploading > 0 && <span className="text-xs text-muted-foreground self-center">Yükleniyor ({uploading})…</span>}
        </div>
      )}
      <div className="relative flex items-end gap-2">
        {mentionOptions.length > 0 && (
          <div className="absolute bottom-full left-10 mb-1 w-56 rounded-md border bg-popover p-1 shadow-md z-10">
            {mentionOptions.map((u) => (
              <button key={u.id} onClick={() => pickMention(u.username)} className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted">@{u.username}</button>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
               accept="image/*,.pdf,.txt,.csv,.xlsx,.docx,.zip" />
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Dosya ekle" onClick={() => fileRef.current?.click()}><Paperclip className="size-4" /></Button>
        <Textarea ref={taRef} value={text} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} onPaste={onPaste}
                  placeholder="Mesaj yaz… (Enter gönder, Shift+Enter satır, @ ile etiketle, görüntü yapıştırılabilir)"
                  className="min-h-[38px] max-h-40 resize-none text-sm" rows={1} />
        <Button size="icon" className="h-9 w-9 shrink-0" onClick={submit} disabled={send.isPending || (!text.trim() && files.length === 0)} title="Gönder">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}
