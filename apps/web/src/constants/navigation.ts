import type { UserRole } from '@/types/auth'

export interface NavItem {
  title: string
  href: string
  icon: string // lucide-react icon bileşen adı
}

export const NAV_ITEMS: NavItem[] = [
  { title: 'İşlemler',           href: '/transactions',      icon: 'ArrowLeftRight' },
  { title: 'Talep Al / Manuel İşlem', href: '/transactions/new', icon: 'Bell' },
  { title: 'Sohbet',             href: '/chat',              icon: 'MessageSquare' },
  { title: 'Tenant Yönetimi',    href: '/tenants',          icon: 'Building2' },
  { title: 'Site Yönetimi',      href: '/merchants',        icon: 'Store' },
  { title: 'Kullanıcı Yönetimi', href: '/users',            icon: 'Users' },
  { title: 'Hesap Yönetimi',     href: '/payment-accounts',         icon: 'CreditCard' },
  { title: 'Aktif Hesap Min-Max',href: '/payment-accounts/min-max', icon: 'BarChart2' },
  { title: 'Bankalar',           href: '/banks',            icon: 'Landmark' },
  { title: 'Kripto Paralar',     href: '/cryptos',          icon: 'Coins' },
  { title: 'Raporlar',           href: '/report_general',   icon: 'BarChart3' },
  { title: 'Gelir/Gider',        href: '/report_finance',   icon: 'Wallet' },
  { title: 'Audit Loglar',       href: '/audit-logs',       icon: 'ClipboardList' },
  { title: 'Kullanıcı Hareketleri', href: '/user-activity', icon: 'Activity' },
  { title: 'Ayarlar',            href: '/settings',         icon: 'Settings' },
  { title: 'Sistem',             href: '/system',           icon: 'Activity' },
]

// Hangi roller hangi menülere erişebilir
export const ROLE_NAV_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: [
    '/tenants', '/merchants', '/users',
    '/banks', '/cryptos', '/report_general', '/report_finance', '/audit-logs', '/user-activity', '/settings', '/system',
  ],
  tenant_admin: [
    '/transactions', '/transactions/new', '/chat', '/merchants', '/users',
    '/payment-accounts', '/payment-accounts/min-max', '/report_finance', '/settings', '/user-activity',
  ],
  finans_admin:    ['/transactions', '/transactions/new', '/chat', '/payment-accounts', '/payment-accounts/min-max', '/user-activity'],
  finans_operator: ['/transactions', '/transactions/new', '/chat', '/user-activity'],
  merchant:        ['/transactions'],
}

export function getNavItemsForRole(role: UserRole | undefined): NavItem[] {
  if (!role) return []
  const allowed = ROLE_NAV_PERMISSIONS[role]
  return NAV_ITEMS.filter((item) => allowed.includes(item.href))
}
