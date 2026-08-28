'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

export function use2FAStatus() {
  return useQuery({
    queryKey: ['profile', '2fa'],
    queryFn: () => apiClient.get<{ enabled: boolean }>('/api/v1/profile/2fa'),
  })
}

export function use2FASetup() {
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ totpUri: string; setupToken: string }>('/api/v1/profile/2fa/setup'),
  })
}

export function use2FAEnable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { code: string; setupToken: string }) =>
      apiClient.post<{ success: boolean }>('/api/v1/profile/2fa/enable', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', '2fa'] }),
  })
}

export function use2FADisable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.delete<{ success: boolean }>('/api/v1/profile/2fa'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', '2fa'] }),
  })
}
