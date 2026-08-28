'use client'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { GlobalCallbackListResponse, CallbackStatusSummary } from '@panel/types'

interface CallbackListParams {
  page:          number
  limit?:        number
  success?:      boolean
  from?:         string
  to?:           string
  transactionId?: string
  merchantId?:   string
}

export function useCallbackStatusSummary() {
  return useQuery({
    queryKey: ['callback-status-summary'],
    queryFn:  () => apiClient.get<CallbackStatusSummary>('/api/v1/callbacks/status-summary'),
    refetchInterval: 30_000,
  })
}

export function useCallbackList(params: CallbackListParams) {
  const { page, limit = 20, success, from, to, transactionId, merchantId } = params

  const query = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (success !== undefined) query.set('success', String(success))
  if (from)          query.set('from', from)
  if (to)            query.set('to', to)
  if (transactionId) query.set('transactionId', transactionId)
  if (merchantId)    query.set('merchantId', merchantId)

  return useQuery({
    queryKey: ['callbacks', params],
    queryFn:  () => apiClient.get<GlobalCallbackListResponse>(`/api/v1/callbacks?${query}`),
  })
}
