"use client"

import * as React from "react"
import {
  ArrowLeftRight,
  Bell,
  Building2,
  Store,
  Users,
  CreditCard,
  Landmark,
  Coins,
  BarChart2,
  BarChart3,
  ClipboardList,
  Settings,
  Activity,
  type LucideIcon,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { getNavItemsForRole } from "@/constants/navigation"
import type { UserRole } from "@/types/auth"

const ICON_MAP: Record<string, LucideIcon> = {
  ArrowLeftRight,
  Bell,
  Building2,
  Store,
  Users,
  CreditCard,
  Landmark,
  Coins,
  BarChart2,
  BarChart3,
  ClipboardList,
  Settings,
  Activity,
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  role: UserRole
  username: string
}

export function AppSidebar({ role, username, ...props }: AppSidebarProps) {
  const navItems = getNavItemsForRole(role).map((item) => ({
    title: item.title,
    url:   item.href,
    icon:  ICON_MAP[item.icon],
  }))

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="group-data-[state=collapsed]:hidden">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:!p-1.5 cursor-default">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">P</span>
              <span className="text-base font-semibold">Panel</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser username={username} role={role} />
      </SidebarFooter>
    </Sidebar>
  )
}
