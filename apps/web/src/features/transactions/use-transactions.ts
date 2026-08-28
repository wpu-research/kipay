'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { TransactionList, ClaimTransactionResponse } from '@panel/types'

export interface TransactionFilters {
  status?:      string
  type?:        'deposit' | 'withdrawal'
  merchantId?:  string
  paymentType?: 'bank' | 'crypto'
  bankId?:      string
  dateFrom?:    string
  dateTo?:      string
  minAmount?:   string
  maxAmount?:   string
  search?:      string
  searchType?:  'kullanici' | 'iban' | 'islem_id'
  page?:        number
  limit?:       number
}

export function useTransactions(tenantId: string, userId: string, filters: TransactionFilters = {}) {
  const { status, type, merchantId, paymentType, bankId, dateFrom, dateTo, minAmount, maxAmount, search, searchType, page = 1, limit = 25 } = filters
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (status)      params.set('status', status)
  if (type)        params.set('type', type)
  if (merchantId)  params.set('merchantId', merchantId)
  if (paymentType) params.set('paymentType', paymentType)
  if (bankId)      params.set('bankId', bankId)
  if (dateFrom)    params.set('dateFrom', dateFrom)
  if (dateTo)      params.set('dateTo', dateTo)
  if (minAmount)   params.set('minAmount', minAmount)
  if (maxAmount)   params.set('maxAmount', maxAmount)
  if (search)      params.set('search', search)
  if (searchType)  params.set('searchType', searchType)

  return useQuery({
    queryKey: ['transactions', tenantId, userId, filters],
    queryFn:  () => apiClient.get<TransactionList>(`/api/v1/transactions?${params}`),
    enabled:  !!tenantId && !!userId,
    refetchInterval: 15_000,
  })
}

export function useClaimTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (transactionId: string) =>
      apiClient.post<ClaimTransactionResponse>(`/api/v1/transactions/${transactionId}/claim`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
