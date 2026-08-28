'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { BlockedPlayerListResponse, BlockPlayerInput } from '@panel/types'

export function useBlockedPlayers(opts?: { merchantId?: string; status?: string; page?: number }) {
  const { merchantId, status = 'all', page = 1 } = opts ?? {}
  const qs = new URLSearchParams({ status, page: String(page) })
  if (merchantId) qs.set('merchantId', merchantId)
  return useQuery({
    queryKey: ['blocked-players', merchantId, status, page],
    queryFn: () => apiClient.get<BlockedPlayerListResponse>(`/api/v1/blocked-players?${qs}`),
  })
}

export function useBlockPlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: BlockPlayerInput) =>
      apiClient.post('/api/v1/blocked-players', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocked-players'] }),
  })
}

export function useUnblockPlayer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/api/v1/blocked-players/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocked-players'] }),
  })
}
