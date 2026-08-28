'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface ManualWithdrawalInput {
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
      apiClient.post('/api/v1/transactions/manual-withdrawal', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
