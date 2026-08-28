'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface SettingsResponse {
  claimTimeoutMinutes: number
  totpRequired: boolean
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn:  () => apiClient.get<SettingsResponse>('/api/v1/settings'),
  })
}

export function useUpdateClaimTimeout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { timeoutMinutes: number }) =>
      apiClient.put<SettingsResponse>('/api/v1/settings/claim-timeout', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}

export function useUpdateTotpRequired() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { totpRequired: boolean }) =>
      apiClient.put<SettingsResponse>('/api/v1/settings/totp-required', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
  })
}
