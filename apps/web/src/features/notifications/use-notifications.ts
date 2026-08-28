'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { NotificationType } from '@panel/types'

interface NotificationList {
  data: NotificationType[]
  meta: { total: number; page: number; limit: number }
}

export function useNotifications(isRead?: boolean, page = 1, limit = 20) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (isRead !== undefined) params.set('isRead', String(isRead))

  return useQuery({
    queryKey:      ['notifications', { isRead, page, limit }],
    queryFn:       () => apiClient.get<NotificationList>(`/api/v1/notifications?${params}`),
    refetchInterval: false,
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', { isRead: false, page: 1, limit: 1 }],
    queryFn:  () => apiClient.get<NotificationList>('/api/v1/notifications?isRead=false&page=1&limit=1'),
    refetchInterval: false,
    select: (data) => data.meta.total,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch<{ success: boolean }>(`/api/v1/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiClient.patch<{ updated: number }>('/api/v1/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
