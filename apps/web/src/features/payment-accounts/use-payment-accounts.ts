'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  PaymentAccountListResponse,
  PaymentAccount,
  CreatePaymentAccountInput,
  UpdatePaymentAccountInput,
  UpdatePaymentAccountStatusInput,
  UpdateDailyLimitInput,
} from '@panel/types'

export function usePaymentAccounts(
  filters: { status?: string; type?: string; bankId?: string } = {},
  page = 1,
  limit = 20,
) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (filters.status) params.set('status', filters.status)
  if (filters.type)   params.set('type', filters.type)
  if (filters.bankId) params.set('bankId', filters.bankId)

  return useQuery({
    queryKey: ['payment-accounts', filters, page, limit],
    queryFn:  () => apiClient.get<PaymentAccountListResponse>(`/api/v1/payment-accounts?${params}`),
  })
}

export function usePaymentAccount(id: string) {
  return useQuery({
    queryKey: ['payment-accounts', id],
    queryFn:  () => apiClient.get<{ data: PaymentAccount }>(`/api/v1/payment-accounts/${id}`),
    enabled:  !!id,
  })
}

export function useCreatePaymentAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePaymentAccountInput) =>
      apiClient.post<{ data: PaymentAccount }>('/api/v1/payment-accounts', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-accounts'] }),
  })
}

export function useUpdatePaymentAccount(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePaymentAccountInput) =>
      apiClient.put<{ data: PaymentAccount }>(`/api/v1/payment-accounts/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-accounts'] }),
  })
}

export function useUpdatePaymentAccountStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePaymentAccountStatusInput) =>
      apiClient.patch<{ data: PaymentAccount }>(`/api/v1/payment-accounts/${id}/status`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-accounts'] }),
  })
}

export function useUpdateDailyLimit(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateDailyLimitInput) =>
      apiClient.put<{ data: PaymentAccount }>(`/api/v1/payment-accounts/${id}/daily-limit`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-accounts'] }),
  })
}
