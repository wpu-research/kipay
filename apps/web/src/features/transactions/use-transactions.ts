'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiError } from '@/lib/api-client'
import type { TransactionList, ClaimTransactionResponse } from '@panel/types'

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export interface TransactionFilters {
  status?:      string
  type?:        'deposit' | 'withdrawal'
  merchantId?:  string
  paymentType?: 'bank' | 'crypto'
  bankId?:      string
  providerId?:  string
  dateFrom?:    string
  dateTo?:      string
  minAmount?:   string
  maxAmount?:   string
  search?:      string
  searchType?:  'kullanici' | 'iban' | 'islem_id'
  page?:        number
  limit?:       number
}

function buildParams(filters: TransactionFilters, withPaging: boolean) {
  const { status, type, merchantId, paymentType, bankId, providerId, dateFrom, dateTo, minAmount, maxAmount, search, searchType, page = 1, limit = 25 } = filters
  const params = new URLSearchParams()
  if (withPaging) { params.set('page', String(page)); params.set('limit', String(limit)) }
  if (status)      params.set('status', status)
  if (type)        params.set('type', type)
  if (merchantId)  params.set('merchantId', merchantId)
  if (paymentType) params.set('paymentType', paymentType)
  if (bankId)      params.set('bankId', bankId)
  if (providerId)  params.set('providerId', providerId)
  if (dateFrom)    params.set('dateFrom', dateFrom)
  if (dateTo)      params.set('dateTo', dateTo)
  if (minAmount)   params.set('minAmount', minAmount)
  if (maxAmount)   params.set('maxAmount', maxAmount)
  if (search)      params.set('search', search)
  if (searchType)  params.set('searchType', searchType)
  return params
}

export function useTransactions(tenantId: string, userId: string, filters: TransactionFilters = {}) {
  const params = buildParams(filters, true)
  return useQuery({
    queryKey: ['transactions', tenantId, userId, filters],
    queryFn:  () => apiClient.get<TransactionList>(`/api/v1/transactions?${params}`),
    enabled:  !!tenantId && !!userId,
    refetchInterval: 15_000,
  })
}

export function useClaimTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (transactionId: string) =>
      apiClient.post<ClaimTransactionResponse>(`/api/v1/transactions/${transactionId}/claim`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

// Mevcut filtrelerle XLSX indir (tarayıcı indirmesi tetiklenir)
export function useExportTransactions() {
  return useMutation({
    mutationFn: async (filters: TransactionFilters) => {
      const params = buildParams(filters, false)
      const res = await fetch(`${API_BASE}/api/v1/transactions/export?${params}`, { credentials: 'include' })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let msg = 'Dışa aktarma başarısız.'
        try { msg = JSON.parse(text)?.error?.message ?? msg } catch { /* ignore */ }
        throw new ApiError('EXPORT_FAILED', msg, res.status)
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') ?? ''
      const m = /filename="([^"]+)"/.exec(cd)
      const filename = m?.[1] ?? `islemler-${new Date().toISOString().slice(0, 10)}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return filename
    },
  })
}
