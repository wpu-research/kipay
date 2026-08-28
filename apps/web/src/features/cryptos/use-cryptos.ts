'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { CryptoListResponse, CreateCrypto } from '@panel/types'

export function useCryptos() {
  return useQuery({
    queryKey:  ['cryptos'],
    queryFn:   () => apiClient.get<CryptoListResponse>('/api/v1/cryptos'),
    staleTime: 1000 * 60 * 60,
  })
}

export function useCreateCrypto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateCrypto) => apiClient.post('/api/v1/cryptos', data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['cryptos'] }),
  })
}

export function useUpdateCryptoStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/api/v1/cryptos/${id}/status`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cryptos'] }),
  })
}
