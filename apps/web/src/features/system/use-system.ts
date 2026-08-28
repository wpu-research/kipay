'use client'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { HealthResponse, QueueStatsResponse } from '@panel/types'

export function useHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: () => apiClient.get<HealthResponse>('/api/v1/system/health'),
    refetchInterval: 30_000, // 30 saniyede bir yenile
  })
}

export function useQueueStats() {
  return useQuery({
    queryKey: ['system-queue-stats'],
    queryFn: () => apiClient.get<QueueStatsResponse>('/api/v1/system/queue-stats'),
    refetchInterval: 30_000,
  })
}

export function useResetTransactions() {
  return useMutation({
    mutationFn: () => apiClient.post<{ ok: boolean }>('/api/v1/system/reset/transactions', {}),
  })
}

export function useResetDailyLimits() {
  return useMutation({
    mutationFn: () => apiClient.post<{ ok: boolean }>('/api/v1/system/reset/daily-limits', {}),
  })
}

export function useResetPaymentAccounts() {
  return useMutation({
    mutationFn: () => apiClient.post<{ ok: boolean }>('/api/v1/system/reset/payment-accounts', {}),
  })
}

export function useResetUsersAndTenants() {
  return useMutation({
    mutationFn: () => apiClient.post<{ ok: boolean }>('/api/v1/system/reset/users-and-tenants', {}),
  })
}
