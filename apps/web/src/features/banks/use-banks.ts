'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { BankListResponse, CreateBank } from '@panel/types'

export function useBanks() {
  return useQuery({
    queryKey: ['banks'],
    queryFn:  () => apiClient.get<BankListResponse>('/api/v1/banks'),
    staleTime: 1000 * 60 * 60,
  })
}

export function useCreateBank() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBank) => apiClient.post('/api/v1/banks', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['banks'] }),
  })
}

export function useUpdateBankStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/api/v1/banks/${id}/status`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['banks'] }),
  })
}
