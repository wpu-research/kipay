'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  PaymentProviderListResponse,
  PaymentProvider,
  PaymentProviderCategoryListResponse,
  PaymentProviderCategory,
  CreatePaymentProviderInput,
  UpdatePaymentProviderInput,
  CreatePaymentProviderCategoryInput,
  UpdatePaymentProviderCategoryInput,
} from '@panel/types'

export function usePaymentProviders(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['payment-providers', page, limit],
    queryFn: () => apiClient.get<PaymentProviderListResponse>(`/api/v1/payment-providers?page=${page}&limit=${limit}`),
  })
}

export function useCreatePaymentProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePaymentProviderInput) =>
      apiClient.post<{ data: PaymentProvider }>('/api/v1/payment-providers', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-providers'] }),
  })
}

export function useUpdatePaymentProvider(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePaymentProviderInput) =>
      apiClient.put<{ data: PaymentProvider }>(`/api/v1/payment-providers/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-providers'] }),
  })
}

export function usePaymentProviderCategories(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['payment-provider-categories', page, limit],
    queryFn: () => apiClient.get<PaymentProviderCategoryListResponse>(`/api/v1/payment-providers/categories?page=${page}&limit=${limit}`),
  })
}

export function useCreatePaymentProviderCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreatePaymentProviderCategoryInput) =>
      apiClient.post<{ data: PaymentProviderCategory }>('/api/v1/payment-providers/categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-provider-categories'] }),
  })
}

export function useUpdatePaymentProviderCategory(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdatePaymentProviderCategoryInput) =>
      apiClient.put<{ data: PaymentProviderCategory }>(`/api/v1/payment-providers/categories/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-provider-categories'] }),
  })
}
