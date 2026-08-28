"use client"

import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { NotificationBell } from "@/features/notifications/NotificationBell"
import { useMe } from "@/features/auth/use-me"

const NOTIFICATION_ROLES = ['tenant_admin', 'finans_admin', 'finans_operator']

const SEGMENT_LABELS: Record<string, string> = {
  transactions:      'İşlemler',
  merchants:         'Site Yönetimi',
  tenants:           'Tenant Yönetimi',
  users:             'Kullanıcı Yönetimi',
  'payment-accounts': 'Hesap Yönetimi',
  banks:             'Bankalar',
  'payment-providers': 'Ödeme Sağlayıcıları',
  reports:           'Raporlar',
  report_general:    'Genel Raporlar',
  'audit-logs':      'Audit Loglar',
  settings:          'Ayarlar',
  system:            'Sistem',
  callbacks:         'Callback Loglar',
  warnings:          'Uyarılar',
  'blocked-players': 'Engellenen Oyuncular',
  profile:           'Profil',
  new:               'Yeni',
}

export function SiteHeader() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  const { data: me } = useMe()
  const showNotifications = me?.user?.role ? NOTIFICATION_ROLES.includes(me.user.role) : false

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />

        <Breadcrumb>
          <BreadcrumbList>
            {segments.length === 0 ? (
              <BreadcrumbItem>
                <BreadcrumbPage>Ana Sayfa</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              segments.map((seg, i) => {
                const isLast = i === segments.length - 1
                const href = '/' + segments.slice(0, i + 1).join('/')
                const label = SEGMENT_LABELS[seg] ?? (i > 0 && segments[i - 1] === 'merchants' ? 'Site Detayı' : seg)
                return (
                  <span key={href} className="flex items-center gap-1.5">
                    {i > 0 && <BreadcrumbSeparator />}
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={href}>{label}</BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </span>
                )
              })
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="ml-auto flex items-center gap-2">
          {showNotifications && <NotificationBell />}
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  )
}
