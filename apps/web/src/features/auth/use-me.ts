'use client'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AuthUser } from '@/types/auth'

export function useMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<{ user: AuthUser }>('/api/v1/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
