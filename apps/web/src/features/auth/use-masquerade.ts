'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useRouter } from 'next/navigation'

export function useMasquerade() {
  const qc = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.post<{ success: boolean; targetUser: { id: string; username: string; role: string } }>(
        `/api/v1/auth/masquerade/${userId}`
      ),
    onSuccess: () => {
      // Tüm cache'i temizle — yeni rol bağlamında eski veriler geçersiz
      qc.clear()
      router.refresh()
    },
  })
}

export function useMasqueradeExit() {
  const qc = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ success: boolean }>('/api/v1/auth/masquerade/exit'),
    onSuccess: () => {
      qc.clear()
      router.refresh()
    },
    onError: () => {
      // P-3: Session sona ermiş masquerade çıkışı başarısız → login'e yönlendir
      router.push('/login')
    },
  })
}
