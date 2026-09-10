'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useMe } from '@/features/auth/use-me'
import { useChatUsers, useCreateConversation, useAddMembers } from './use-chat'
import { ApiError } from '@/lib/api-client'

const ROLE_TR: Record<string, string> = { tenant_admin: 'Tenant Admin', finans_admin: 'Finans Admin', finans_operator: 'Finans Operatör' }

function UserPicker({ selected, onToggle, exclude = [], query, setQuery }: {
  selected: string[]; onToggle: (id: string) => void; exclude?: string[]; query: string; setQuery: (q: string) => void
}) {
  const { data } = useChatUsers()
  const users = (data?.data ?? []).filter((u) => !exclude.includes(u.id) && u.username.toLowerCase().includes(query.toLowerCase()))
  return (
    <div className="space-y-2">
      <Input className="h-8 text-xs" placeholder="Kullanıcı ara..." value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="max-h-56 overflow-y-auto rounded-md border p-1 space-y-0.5">
        {users.length === 0 && <p className="p-2 text-xs text-muted-foreground">Kullanıcı yok</p>}
        {users.map((u) => (
          <label key={u.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted cursor-pointer">
            <Checkbox checked={selected.includes(u.id)} onCheckedChange={() => onToggle(u.id)} />
            <span className="font-medium">@{u.username}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{ROLE_TR[u.role] ?? u.role}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

export function NewChannelDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [members, setMembers] = useState<string[]>([])
  const [q, setQ] = useState('')
  const { data: me } = useMe()
  const create = useCreateConversation()

  async function submit() {
    try {
      const res = await create.mutateAsync({ type: 'channel', name: name.trim(), isPrivate, memberIds: members })
      toast.success(`#${res.data.name} oluşturuldu`)
      onCreated(res.data.id); reset(); onClose()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Kanal oluşturulamadı') }
  }
  function reset() { setName(''); setIsPrivate(false); setMembers([]); setQ('') }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Yeni Kanal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Kanal adı *</label>
            <Input className="h-9" placeholder="örn. yatirim-ekibi" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={isPrivate} onCheckedChange={(v) => setIsPrivate(!!v)} />
            Özel kanal <span className="text-xs text-muted-foreground">(yalnızca eklenen üyeler görür)</span>
          </label>
          <div className="space-y-1">
            <label className="text-xs font-medium">Üyeler {isPrivate ? '*' : '(opsiyonel)'}</label>
            <UserPicker selected={members} onToggle={(id) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))} exclude={me ? [me.user.id] : []} query={q} setQuery={setQ} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={submit} disabled={create.isPending || name.trim().length < 2}>{create.isPending ? 'Oluşturuluyor...' : 'Oluştur'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NewDirectDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [q, setQ] = useState('')
  const { data } = useChatUsers()
  const { data: me } = useMe()
  const create = useCreateConversation()
  const users = (data?.data ?? []).filter((u) => u.id !== me?.user.id && u.username.toLowerCase().includes(q.toLowerCase()))

  async function pick(userId: string) {
    try {
      const res = await create.mutateAsync({ type: 'direct', userId })
      onCreated(res.data.id); setQ(''); onClose()
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Sohbet açılamadı') }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setQ(''); onClose() } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Yeni Mesaj</DialogTitle></DialogHeader>
        <Input className="h-8 text-xs" placeholder="Kullanıcı ara..." value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="max-h-64 overflow-y-auto rounded-md border p-1 space-y-0.5">
          {users.length === 0 && <p className="p-2 text-xs text-muted-foreground">Kullanıcı yok</p>}
          {users.map((u) => (
            <button key={u.id} onClick={() => pick(u.id)} disabled={create.isPending}
                    className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted text-left">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold uppercase">{u.username.slice(0, 2)}</span>
              <span className="font-medium">@{u.username}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{ROLE_TR[u.role] ?? u.role}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AddMembersDialog({ open, onClose, conversationId, existing }: { open: boolean; onClose: () => void; conversationId: string; existing: string[] }) {
  const [members, setMembers] = useState<string[]>([])
  const [q, setQ] = useState('')
  const add = useAddMembers(conversationId)
  async function submit() {
    try { await add.mutateAsync(members); toast.success('Üyeler eklendi'); setMembers([]); onClose() }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Eklenemedi') }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setMembers([]); onClose() } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Üye Ekle</DialogTitle></DialogHeader>
        <UserPicker selected={members} onToggle={(id) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))} exclude={existing} query={q} setQuery={setQ} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>İptal</Button>
          <Button onClick={submit} disabled={add.isPending || members.length === 0}>Ekle</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
