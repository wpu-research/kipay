'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { CurrentRatesResponse, SyncRatesResponse, ExchangeRateHistoryResponse } from '@panel/types'

export function useCurrentRates() {
  return useQuery({
    queryKey: ['exchange-rates', 'current'],
    queryFn:  () => apiClient.get<CurrentRatesResponse>('/api/v1/exchange-rates/current'),
  })
}

export function useSyncRates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<SyncRatesResponse>('/api/v1/exchange-rates/sync'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exchange-rates'] })
    },
  })
}

export function useExchangeRateHistory(filters: { currency?: string; page: number }) {
  const params = new URLSearchParams()
  if (filters.currency) params.set('currency', filters.currency)
  params.set('page',  String(filters.page))
  params.set('limit', '20')

  return useQuery({
    queryKey: ['exchange-rates', 'history', filters],
    queryFn:  () => apiClient.get<ExchangeRateHistoryResponse>(`/api/v1/exchange-rates/history?${params}`),
  })
}


