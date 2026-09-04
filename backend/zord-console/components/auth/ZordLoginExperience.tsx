'use client'

import { useRouter } from 'next/navigation'
import { login, logout } from '@/services/auth'
import type { UserRole } from '@/types/auth'
import { DarkLoginLayout } from './DarkLoginLayout'
import { LoginFormDark } from './LoginFormDark'

export type ZordLoginExperienceProps = {
  audience: string
  pageTitle: string
  pageDescription: string
  heroEyebrow: string
  heroTitle: string
  heroDescription: string
  accessBadges: readonly string[]
  trustBadges: readonly string[]
  stats: readonly { value: string; label: string }[]
  highlights: readonly { title: string; description: string }[]
  redirectTo: string
  role: Extract<UserRole, 'ADMIN' | 'OPS'>
}

export function ZordLoginExperience({
  audience,
  pageTitle,
  pageDescription,
  heroEyebrow,
  heroTitle,
  heroDescription,
  accessBadges,
  trustBadges,
  stats,
  highlights,
  redirectTo,
  role,
}: ZordLoginExperienceProps) {
  const router = useRouter()
  const loginSurface = role === 'ADMIN' ? 'admin' : 'ops'

  async function handleLogin(
    email: string,
    password: string,
    tenantId: string,
    _environment: 'sandbox' | 'production',
    _rememberDevice: boolean,
  ) {
    const envelope = await login({
      workspaceId: tenantId,
      email,
      password,
      loginSurface,
    })

    if (envelope.user.role !== role) {
      await logout()
      const err = new Error(
        role === 'ADMIN'
          ? 'This entry is for platform administrators only. Use an admin account.'
          : 'This entry is for operations staff only. Use an ops account.',
      )
      throw err
    }

    router.push(redirectTo)
    router.refresh()
  }

  return (
    <DarkLoginLayout logoText="ZORD" tagline={audience} backToWebsiteLink="/">
      <div className="space-y-8">
        <header className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">{heroEyebrow}</p>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-[2rem]">{pageTitle}</h1>
          <p className="text-[15px] leading-relaxed text-slate-300">{pageDescription}</p>
        </header>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">{heroTitle}</p>
          <p className="text-[14px] leading-relaxed text-slate-200">{heroDescription}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {accessBadges.map((label) => (
            <span
              key={`access-${label}`}
              className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[12px] font-medium text-emerald-100"
            >
              {label}
            </span>
          ))}
          {trustBadges.map((label) => (
            <span
              key={`trust-${label}`}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-medium text-slate-200"
            >
              {label}
            </span>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <div className="text-xl font-bold tabular-nums text-white">{s.value}</div>
              <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>

        <ul className="space-y-3 border-t border-white/10 pt-6">
          {highlights.map((h) => (
            <li key={h.title} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden />
              <div>
                <p className="text-[14px] font-semibold text-white">{h.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{h.description}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-white/10 pt-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Sign in</h2>
          <LoginFormDark
            onSubmit={handleLogin}
            emailPlaceholder="you@company.com"
            tenantPlaceholder="Workspace / tenant id"
            submitLabel={role === 'ADMIN' ? 'Sign in to Admin' : 'Sign in to Ops'}
          />
        </div>
      </div>
    </DarkLoginLayout>
  )
}
