'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { UserListResponse, CreateUserInput, CreateUserResponse, TenantListResponse } from '@panel/types'
import { useMe } from '@/features/auth/use-auth'

export function useUsers(page = 1, limit = 20, filterTenantId?: string) {
  const { data: meData } = useMe()
  const tenantId = meData?.user?.tenantId
  return useQuery({
    queryKey: ['users', tenantId, page, limit, filterTenantId],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (filterTenantId) params.set('tenantId', filterTenantId)
      return apiClient.get<UserListResponse>(`/api/v1/users?${params}`)
    },
    enabled: !!tenantId,
  })
}

export function useTenants() {
  const { data: meData } = useMe()
  const isSuperAdmin = meData?.user?.role === 'super_admin'
  return useQuery({
    queryKey: ['tenants-list'],
    queryFn: () => apiClient.get<TenantListResponse>('/api/v1/tenants?limit=100'),
    enabled: isSuperAdmin,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserInput) =>
      apiClient.post<CreateUserResponse>('/api/v1/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useDeleteUser(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.delete(`/api/v1/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUserStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: 'active' | 'inactive') =>
      apiClient.patch(`/api/v1/users/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['user', id] })
    },
  })
}

