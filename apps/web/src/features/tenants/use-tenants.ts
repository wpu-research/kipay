'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { TenantListResponse, Tenant, CreateTenantInput, UpdateTenantInput } from '@panel/types'

export function useTenants(page = 1, limit = 20, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['tenants', page, limit],
    queryFn: () => apiClient.get<TenantListResponse>(`/api/v1/tenants?page=${page}&limit=${limit}`),
    enabled: options?.enabled,
  })
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: ['tenant', id],  // P-6: Ayrı prefix — useTenants list invalidasyonu bunu etkilemez
    queryFn: () => apiClient.get<{ data: Tenant }>(`/api/v1/tenants/${id}`),
    enabled: !!id,             // P-6: Boş id ile geçersiz UUID isteği atılmaz
  })
}

export function useCreateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTenantInput) =>
      apiClient.post<{ data: Tenant }>('/api/v1/tenants', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })
}

export function useUpdateTenant(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateTenantInput) =>
      apiClient.put<{ data: Tenant }>(`/api/v1/tenants/${id}`, data),
    // P-7: Hem list hem tekil sorgu invalidate edilir
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] })
      qc.invalidateQueries({ queryKey: ['tenant', id] })
    },
  })
}

export function useDeleteTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ data: Tenant }>(`/api/v1/tenants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })
}

export function useUpdateTenantStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: 'active' | 'inactive') =>
      apiClient.patch<{ data: Tenant }>(`/api/v1/tenants/${id}/status`, { status }),
    // P-7: Hem list hem tekil sorgu invalidate edilir
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] })
      qc.invalidateQueries({ queryKey: ['tenant', id] })
    },
  })
}
