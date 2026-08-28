'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { ApiKeyListResponse, ApiKeyCreated, IpWhitelistResponse, CreateApiKeyInput, AddIpInput } from '@panel/types'

export function useMerchantApiKeys(merchantId: string) {
  return useQuery({
    queryKey: ['merchant-api-keys', merchantId],
    queryFn: () => apiClient.get<ApiKeyListResponse>(`/api/v1/merchants/${merchantId}/api-keys`),
    enabled: !!merchantId,
  })
}

export function useCreateApiKey(merchantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateApiKeyInput) =>
      apiClient.post<{ data: ApiKeyCreated }>(`/api/v1/merchants/${merchantId}/api-keys`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchant-api-keys', merchantId] }),
  })
}

export function useRevokeApiKey(merchantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) =>
      apiClient.delete(`/api/v1/merchants/${merchantId}/api-keys/${keyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchant-api-keys', merchantId] }),
  })
}

export function useRotateApiKey(merchantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) =>
      apiClient.post<{ data: ApiKeyCreated }>(`/api/v1/merchants/${merchantId}/api-keys/${keyId}/rotate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchant-api-keys', merchantId] }),
  })
}

export function useIpWhitelist(merchantId: string) {
  return useQuery({
    queryKey: ['merchant-ip-whitelist', merchantId],
    queryFn: () => apiClient.get<IpWhitelistResponse>(`/api/v1/merchants/${merchantId}/ip-whitelist`),
    enabled: !!merchantId,
  })
}

export function useAddIp(merchantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AddIpInput) =>
      apiClient.post(`/api/v1/merchants/${merchantId}/ip-whitelist`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchant-ip-whitelist', merchantId] }),
  })
}

export function useRemoveIp(merchantId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ip: string) =>
      apiClient.delete(`/api/v1/merchants/${merchantId}/ip-whitelist/${encodeURIComponent(ip)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchant-ip-whitelist', merchantId] }),
  })
}
