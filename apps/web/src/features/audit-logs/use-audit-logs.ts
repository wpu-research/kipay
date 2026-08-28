'use client'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AuditLogListResponse, AuditLogFilter } from '@panel/types'

export type AuditLogsFilters = {
  page?: number
  limit?: number
  from?: string
  to?: string
  action?: string
  userId?: string
  resourceId?: string
  resourceType?: string
  tenantId?: string // super_admin only
}

export function useAuditLogs(filters: AuditLogsFilters = {}) {
  const { page = 1, limit = 20, from, to, action, userId, resourceId, resourceType, tenantId } = filters

  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (from)         params.set('from', from)
  if (to)           params.set('to', to)
  if (action)       params.set('action', action)
  if (userId)       params.set('userId', userId)
  if (resourceId)   params.set('resourceId', resourceId)
  if (resourceType) params.set('resourceType', resourceType)
  if (tenantId)     params.set('tenantId', tenantId)

  return useQuery({
    queryKey: ['audit-logs-v2', page, limit, from, to, action, userId, resourceId, resourceType, tenantId],
    queryFn: () => apiClient.get<AuditLogListResponse>(`/api/v1/audit-logs?${params.toString()}`),
  })
}

export function useTenantAuditLogs(
  tenantId: string,
  filters: Partial<Omit<AuditLogFilter, 'page' | 'limit'>> & { page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 20, from, to, action } = filters

  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (from)   params.set('from', from)
  if (to)     params.set('to', to)
  if (action) params.set('action', action)

  return useQuery({
    queryKey: ['audit-logs', tenantId, page, limit, from, to, action],
    queryFn: () => apiClient.get<AuditLogListResponse>(
      `/api/v1/tenants/${tenantId}/audit-logs?${params.toString()}`
    ),
    enabled: !!tenantId,
  })
}
