'use client'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { CustomerListResponse, CustomerListFilters } from '@panel/types'

export function useCustomers(filters: CustomerListFilters = {}) {
  const params = new URLSearchParams()
  if (filters.search)     params.set('search',     filters.search)
  if (filters.merchantId) params.set('merchantId', filters.merchantId)
  if (filters.tenantId)   params.set('tenantId',   filters.tenantId)
  params.set('page',  String(filters.page  ?? 1))
  params.set('limit', String(filters.limit ?? 20))
  return useQuery({
    queryKey: ['customers', filters],
    queryFn:  () => apiClient.get<CustomerListResponse>(`/api/v1/customers?${params.toString()}`),
  })
}
