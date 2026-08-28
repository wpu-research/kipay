'use client'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { AuthUser } from '@/types/auth'

type LoginResponse =
  | { status: '2FA_REQUIRED' }
  | { status: 'LOGGED_IN'; user: AuthUser }

export function useLogin() {
  return useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      apiClient.post<LoginResponse>('/api/v1/auth/login', data),
  })
}

export function useVerify2FA() {
  return useMutation({
    // BS-1 fix: tempToken cookie ile taşınır, body'de gönderilmez
    mutationFn: (data: { code: string }) =>
      apiClient.post<{ user: AuthUser }>('/api/v1/auth/2fa/verify', data),
  })
}

export function useLogout() {
  return useMutation({
    mutationFn: () => apiClient.post('/api/v1/auth/logout'),
  })
}

export function useMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<{ user: AuthUser }>('/api/v1/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 dakika
  })
}
