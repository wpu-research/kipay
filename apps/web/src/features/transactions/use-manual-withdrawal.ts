'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { TransactionList, ManualDepositInput } from '@panel/types'

type TxItem = TransactionList['data'][number]

export interface ManualWithdrawalInput {
  merchantId:            string
  externalUserId:        string
  amount:                string
  currency:              string
  paymentMethod:         string
  withdrawalAddress:     string
  withdrawalAccountName: string
}

export function useCreateManualWithdrawal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ManualWithdrawalInput) =>
      apiClient.post<TxItem>('/api/v1/transactions/manual-withdrawal', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useCreateManualDeposit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ManualDepositInput) =>
      apiClient.post<TxItem>('/api/v1/transactions/manual-deposit', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['payment-accounts'] })
    },
  })
}
