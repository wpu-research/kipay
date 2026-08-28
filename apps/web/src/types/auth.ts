export type UserRole = 'super_admin' | 'tenant_admin' | 'finans_admin' | 'finans_operator' | 'merchant'

export interface AuthUser {
  id: string
  username: string
  role: UserRole
  tenantId: string
  merchantId?: string
}
