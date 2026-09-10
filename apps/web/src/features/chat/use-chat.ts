'use client'
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  ChatConversation, ChatConversationListResponse, ChatMessage, ChatMessageListResponse, ChatUser,
  CreateChatConversationInput, SendChatMessageInput, ChatAttachmentMeta,
} from '@panel/types'

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
export const attachmentUrl = (id: string, download = false) => `${API_BASE}/api/v1/chat/attachments/${id}${download ? '?download=1' : ''}`

export function useChatUsers() {
  return useQuery({ queryKey: ['chat', 'users'], queryFn: () => apiClient.get<{ data: ChatUser[] }>('/api/v1/chat/users'), staleTime: 60_000 })
}

export function useChatUnread() {
  return useQuery({
    queryKey: ['chat', 'unread'],
    queryFn:  () => apiClient.get<{ total: number }>('/api/v1/chat/unread-count'),
    select:   (d) => d.total,
    refetchInterval: 60_000,
  })
}

export function useConversations() {
  return useQuery({ queryKey: ['chat', 'conversations'], queryFn: () => apiClient.get<ChatConversationListResponse>('/api/v1/chat/conversations') })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateChatConversationInput) => apiClient.post<{ data: ChatConversation }>('/api/v1/chat/conversations', input),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }),
  })
}

export function useMessages(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: ['chat', 'messages', conversationId],
    enabled:  !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiClient.get<ChatMessageListResponse>(`/api/v1/chat/conversations/${conversationId}/messages?limit=50${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (last) => (last.hasMore && last.data.length > 0 ? last.data[0].createdAt : undefined),
    select: (d) => ({ ...d, pages: [...d.pages].reverse() }),  // en eski sayfa önce
  })
}

/** SSE ile gelen mesajı cache'e ekle/güncelle — refetch olmadan */
export function useMessageCache() {
  const qc = useQueryClient()
  type Cache = { pages: ChatMessageListResponse[]; pageParams: unknown[] }
  return {
    upsert(msg: ChatMessage) {
      qc.setQueryData<Cache>(['chat', 'messages', msg.conversationId], (old) => {
        if (!old) return old
        const pages = old.pages.map((p) => ({ ...p, data: p.data.map((m) => (m.id === msg.id ? msg : m)) }))
        const exists = pages.some((p) => p.data.some((m) => m.id === msg.id))
        if (!exists) pages[0] = { ...pages[0], data: [...pages[0].data, msg] }  // pages[0] = en yeni sayfa (ters çevrilmemiş ham cache)
        return { ...old, pages }
      })
    },
    remove(conversationId: string, messageId: string) {
      qc.setQueryData<Cache>(['chat', 'messages', conversationId], (old) => old ? {
        ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.map((m) => (m.id === messageId ? { ...m, content: '', attachments: [], deletedAt: new Date().toISOString() } : m)) })),
      } : old)
    },
  }
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SendChatMessageInput) => apiClient.post<{ data: ChatMessage }>(`/api/v1/chat/conversations/${conversationId}/messages`, input),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }) },
  })
}

export function useEditMessage() {
  return useMutation({ mutationFn: ({ id, content }: { id: string; content: string }) => apiClient.patch<{ data: ChatMessage }>(`/api/v1/chat/messages/${id}`, { content }) })
}
export function useDeleteMessage() {
  return useMutation({ mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/chat/messages/${id}`) })
}
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => apiClient.post<void>(`/api/v1/chat/conversations/${conversationId}/read`, {}),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['chat', 'unread'] }); qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }) },
  })
}
export function useTyping(conversationId: string) {
  return useMutation({ mutationFn: () => apiClient.post<void>(`/api/v1/chat/conversations/${conversationId}/typing`, {}) })
}
export function useAddMembers(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userIds: string[]) => apiClient.post<{ data: ChatConversation }>(`/api/v1/chat/conversations/${conversationId}/members`, { userIds }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }),
  })
}
export function useRemoveMember(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => apiClient.delete<void>(`/api/v1/chat/conversations/${conversationId}/members/${userId}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['chat', 'conversations'] }),
  })
}

export function useUploadAttachment() {
  return useMutation({
    mutationFn: async (file: File): Promise<ChatAttachmentMeta> => {
      const dataBase64 = await new Promise<string>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(String(r.result))
        r.onerror = () => rej(new Error('Dosya okunamadı'))
        r.readAsDataURL(file)
      })
      const out = await apiClient.post<{ data: ChatAttachmentMeta }>('/api/v1/chat/attachments', {
        name: file.name || 'ekran-goruntusu.png', mime: file.type || 'application/octet-stream', dataBase64,
      })
      return out.data
    },
  })
}

export async function downloadAttachment(a: ChatAttachmentMeta) {
  const res = await fetch(attachmentUrl(a.id, true), { credentials: 'include' })
  if (!res.ok) throw new Error('İndirilemedi')
  const blob = await res.blob()
  const el = document.createElement('a')
  el.href = URL.createObjectURL(blob); el.download = a.name
  document.body.appendChild(el); el.click(); el.remove(); URL.revokeObjectURL(el.href)
}
