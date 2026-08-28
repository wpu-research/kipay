'use client'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  TransactionReportResponse,
  CallbackReportResponse,
  TransactionReportFilters,
  ExportJobStatus,
  MerchantDailyReportResponse,
  MerchantDailyReportFilters,
} from '@panel/types'

export function useTransactionReport(filters: TransactionReportFilters = {}) {
  const params = new URLSearchParams()
  if (filters.from)              params.set('from',              filters.from)
  if (filters.to)                params.set('to',                filters.to)
  if (filters.merchantId)        params.set('merchantId',        filters.merchantId)
  if (filters.paymentProviderId) params.set('paymentProviderId', filters.paymentProviderId)
  if (filters.status)            params.set('status',            filters.status)
  if (filters.tenantId)          params.set('tenantId',          filters.tenantId)
  const qs = params.toString()

  return useQuery({
    queryKey: ['reports', 'transactions', filters],
    queryFn:  () => apiClient.get<TransactionReportResponse>(`/api/v1/reports/transactions${qs ? `?${qs}` : ''}`),
  })
}

export function useCallbackReport(tenantId?: string) {
  const params = tenantId ? `?tenantId=${tenantId}` : ''

  return useQuery({
    queryKey: ['reports', 'callbacks', tenantId],
    queryFn:  () => apiClient.get<CallbackReportResponse>(`/api/v1/reports/callbacks${params}`),
  })
}

export function useMerchantDailyReport(filters: MerchantDailyReportFilters = {}) {
  const params = new URLSearchParams()
  if (filters.from)     params.set('from',     filters.from)
  if (filters.to)       params.set('to',       filters.to)
  if (filters.tenantId) params.set('tenantId', filters.tenantId)
  const qs = params.toString()

  return useQuery({
    queryKey: ['reports', 'merchant-daily', filters],
    queryFn:  () => apiClient.get<MerchantDailyReportResponse>(`/api/v1/reports/merchant-daily${qs ? `?${qs}` : ''}`),
  })
}

export function useStartExport() {
  return useMutation({
    mutationFn: (body: { format: 'csv' | 'xlsx'; from?: string; to?: string; tenantId?: string; status?: string; merchantId?: string }) =>
      apiClient.post<{ jobId: string }>('/api/v1/reports/export', body),
  })
}

export function useExportJob(jobId: string | null) {
  return useQuery({
    queryKey:        ['reports', 'export', jobId],
    queryFn:         () => apiClient.get<ExportJobStatus>(`/api/v1/reports/export/${jobId}`),
    enabled:         !!jobId,
    refetchInterval: (query) => {
      const status = (query.state.data as ExportJobStatus | undefined)?.status
      return status === 'completed' || status === 'failed' ? false : 3000
    },
  })
}
