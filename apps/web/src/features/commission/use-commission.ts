'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  CommissionReportResponse, CommissionReportFilters,
  CommissionRatesResponse, CommissionRate, CommissionRateUpsert,
  SettlementUpsert, CommissionSettlementRow,
} from '@panel/types'

export function useCommissionReport(filters: CommissionReportFilters = {}) {
  const params = new URLSearchParams()
  if (filters.from)       params.set('from',       filters.from)
  if (filters.to)         params.set('to',         filters.to)
  if (filters.tenantId)   params.set('tenantId',   filters.tenantId)
  if (filters.merchantId) params.set('merchantId', filters.merchantId)
  const qs = params.toString()
  return useQuery({
    queryKey: ['commission', 'report', filters],
    queryFn:  () => apiClient.get<CommissionReportResponse>(`/api/v1/commission/report${qs ? `?${qs}` : ''}`),
  })
}

export function useCommissionRates(merchantId?: string) {
  const qs = merchantId ? `?merchantId=${merchantId}` : ''
  return useQuery({
    queryKey: ['commission', 'rates', merchantId],
    queryFn:  () => apiClient.get<CommissionRatesResponse>(`/api/v1/commission/rates${qs}`),
    enabled:  !!merchantId,
  })
}

export function useUpsertCommissionRate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CommissionRateUpsert) => apiClient.put<CommissionRate>('/api/v1/commission/rates', body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['commission', 'rates'] }),
  })
}

export function useUpsertSettlement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SettlementUpsert) => apiClient.put<CommissionSettlementRow>('/api/v1/commission/settlements', body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['commission', 'report'] })
      qc.invalidateQueries({ queryKey: ['commission', 'settlements'] })
    },
  })
}
