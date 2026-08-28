'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { CreateWarningRuleInput } from '@panel/types'

export function useWarningRules(opts?: { page?: number }) {
  const page = opts?.page ?? 1
  return useQuery({
    queryKey: ['warning-rules', page],
    queryFn: () => apiClient.get(`/api/v1/warnings/rules?page=${page}`),
  })
}

export function useCreateWarningRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateWarningRuleInput) =>
      apiClient.post('/api/v1/warnings/rules', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warning-rules'] }),
  })
}

export function useUpdateWarningRuleStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/api/v1/warnings/rules/${id}/status`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warning-rules'] }),
  })
}

export function useWarnings(opts?: { status?: string; ruleType?: string; page?: number }) {
  const { status = 'all', ruleType, page = 1 } = opts ?? {}
  const qs = new URLSearchParams({ status, page: String(page) })
  if (ruleType) qs.set('ruleType', ruleType)
  return useQuery({
    queryKey: ['warnings', status, ruleType, page],
    queryFn: () => apiClient.get(`/api/v1/warnings?${qs}`),
  })
}

export function useAcknowledgeWarning() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/api/v1/warnings/${id}/acknowledge`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warnings'] }),
  })
}
