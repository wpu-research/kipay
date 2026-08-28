import type { UserRole } from '@/types/auth'

export function getRedirectPath(role: UserRole): string {
  switch (role) {
    case 'super_admin':     return '/system'
    case 'tenant_admin':    return '/transactions'
    case 'finans_admin':    return '/transactions'
    case 'finans_operator': return '/transactions'
    case 'merchant':        return '/transactions'
    default:                return '/transactions'
  }
}
