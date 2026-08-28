'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { useMe } from '@/features/auth/use-auth'
import type { MerchantListResponse, Merchant, CreateMerchantInput } from '@panel/types'

export function useMerchants(page = 1, limit = 20, filterTenantId?: string, enabled = true) {
  const { data: meData } = useMe()
  const tenantId = meData?.user?.tenantId
  const role     = meData?.user?.role
  return useQuery({
    queryKey: ['merchants', tenantId, page, limit, filterTenantId],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (filterTenantId) params.set('tenantId', filterTenantId)
      return apiClient.get<MerchantListResponse>(`/api/v1/merchants?${params}`)
    },
    enabled: enabled && (role === 'super_admin' ? true : !!tenantId),
  })
}

export function useMerchant(id: string) {
  return useQuery({
    queryKey: ['merchant', id],
    queryFn: () => apiClient.get<{ data: Merchant }>(`/api/v1/merchants/${id}`),
    enabled: !!id,
  })
}

export function useRegenerateCallbackSecret(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ data: Merchant }>(`/api/v1/merchants/${id}/regenerate-callback-secret`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchant', id] }),
  })
}

export function useCreateMerchant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateMerchantInput) =>
      apiClient.post<{ data: Merchant }>('/api/v1/merchants', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchants'] }),
  })
}

export function useDeleteMerchant(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.delete(`/api/v1/merchants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['merchants'] }),
  })
}

export function useToggleSandbox(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (isSandbox: boolean) =>
      apiClient.patch<{ data: Merchant }>(`/api/v1/merchants/${id}/sandbox`, { isSandbox }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['merchants'] })
      qc.invalidateQueries({ queryKey: ['merchant', id] })
    },
  })
}

export function useUpdateMerchantStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: 'active' | 'inactive') =>
      apiClient.patch<{ data: Merchant }>(`/api/v1/merchants/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['merchants'] })
      qc.invalidateQueries({ queryKey: ['merchant', id] })
    },
  })
}
