import { ThemeSwitcher } from '@/components/theme-switcher'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-background">
      <div className="absolute right-4 top-4 z-50">
        <ThemeSwitcher />
      </div>
      {children}
    </div>
  )
}
