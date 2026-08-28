'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { TransactionDetail, ApproveRejectResponse, TransactionComment, CallbackListResponse, RetryCallbackResponse } from '@panel/types'

export function useTransactionDetail(id: string) {
  return useQuery({
    queryKey: ['transaction', id],
    queryFn:  () => apiClient.get<TransactionDetail>(`/api/v1/transactions/${id}`),
    enabled:  !!id,
  })
}

export function useApproveTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<ApproveRejectResponse>(`/api/v1/transactions/${id}/approve`, {}),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['transaction', id] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useRejectTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post<ApproveRejectResponse>(`/api/v1/transactions/${id}/reject`, { reason }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['transaction', id] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useFlagTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<ApproveRejectResponse>(`/api/v1/transactions/${id}/flag`, {}),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['transaction', id] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useResolveTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'approved' | 'rejected'; reason: string }) =>
      apiClient.post<ApproveRejectResponse>(`/api/v1/transactions/${id}/resolve`, { decision, reason }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['transaction', id] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiClient.post<TransactionComment>(`/api/v1/transactions/${id}/comments`, { content }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['transaction', id] })
    },
  })
}

export function useCallbackLogs(txId: string) {
  return useQuery({
    queryKey: ['callbackLogs', txId],
    queryFn:  () => apiClient.get<CallbackListResponse>(`/api/v1/transactions/${txId}/callbacks`),
    enabled:  !!txId,
  })
}

export function useRetryCallback(txId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiClient.post<RetryCallbackResponse>(`/api/v1/transactions/${txId}/retry-callback`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['callbackLogs', txId] })
    },
  })
}

export function useApproveTransactionWithAmount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, adjustedAmount }: { id: string; adjustedAmount: string }) =>
      apiClient.post<ApproveRejectResponse>(`/api/v1/transactions/${id}/approve-with-amount`, { adjustedAmount }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['transaction', id] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
