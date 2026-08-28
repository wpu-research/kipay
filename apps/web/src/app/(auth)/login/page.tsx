'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Figtree } from 'next/font/google'
import { useLogin } from '@/features/auth/use-auth'
import { getRedirectPath } from '@/features/auth/auth-redirect'
import type { UserRole } from '@/types/auth'
import type { ApiError } from '@/lib/api-client'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Input } from '@/components/ui/input'

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree' })

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()
  const loginMutation = useLogin()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await loginMutation.mutateAsync({ username, password })
      if (result.status === 'LOGGED_IN') {
        router.push(getRedirectPath(result.user.role as UserRole))
      } else {
        router.push('/2fa')
      }
    } catch {
      // Hata loginMutation.error üzerinden gösterilir
    }
  }

  const errorMessage = loginMutation.error
    ? (loginMutation.error as ApiError).message ?? 'Giriş başarısız'
    : null

  return (
    <div
      className={`${figtree.variable} relative flex min-h-screen items-center justify-center bg-black px-6`}
      style={{ fontFamily: 'var(--font-figtree)' }}
    >
      <div className="absolute right-4 top-4">
        <ThemeSwitcher />
      </div>
      <div className="w-full max-w-[400px]">

        {/* Form */}
        <form onSubmit={handleSubmit} method="post" className="space-y-4">

          {/* Kullanıcı adı */}
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium text-foreground">
              Kullanıcı adı
            </label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="kullanıcı adınız"
            />
          </div>

          {/* Şifre */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Şifre
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          {/* Hata */}
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-3">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-destructive">{errorMessage}</p>
            </div>
          )}

          {/* Buton */}
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loginMutation.isPending ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>

      </div>
    </div>
  )
}
