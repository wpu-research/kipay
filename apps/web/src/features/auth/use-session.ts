'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export interface SessionItem {
  id: string
  ip: string
  userAgent: string
  createdAt: string
  current: boolean
}

export function useSessions() {
  return useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => apiClient.get<{ data: SessionItem[] }>('/api/v1/auth/sessions'),
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.delete(`/api/v1/auth/sessions/${sessionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  })
}

// ADR-AUTH-001: useRevokeAllSessions kaldırıldı — tek session politikasıyla endpoint silindi

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiClient.put('/api/v1/auth/password', data),
  })
}
