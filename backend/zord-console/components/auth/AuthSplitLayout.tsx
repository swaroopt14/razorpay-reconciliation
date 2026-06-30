'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AUTH_UI } from './authUiTokens'

type AuthMarketingVariant = 'signin' | 'signup' | 'demo'

const MARKETING: Record<
  AuthMarketingVariant,
  { headline: string; features: [string, string, string] }
> = {
  signin: {
    headline: 'Join finance teams that trust Arealis Zord to prove every payout.',
    features: ['Payment intelligence', 'Proof-ready evidence', 'Live & sandbox workspaces'],
  },
  signup: {
    headline: 'Provision a tenant on Arealis Zord — payout control and defensibility, ready to ship.',
    features: ['Tenant provisioning', 'Secure API keys', 'Sandbox-first onboarding'],
  },
  demo: {
    headline: 'Tell us about your payments — see how Zord controls and proves every payout.',
    features: ['Payout control', 'Proof-ready evidence', 'A team that calls you back'],
  },
}

function MarketingBands() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute -left-[12%] top-[8%] h-[120%] w-[55%] -skew-x-[14deg] opacity-90"
        style={{ background: 'linear-gradient(165deg, #E8F4FC 0%, #D4EBF7 55%, #C5E3F3 100%)' }}
      />
      <div
        className="absolute left-[18%] top-0 h-full w-[38%] -skew-x-[14deg] opacity-80"
        style={{ background: 'linear-gradient(180deg, #E0F5F0 0%, #C8EDE4 70%, #B8E6DC 100%)' }}
      />
      <div
        className="absolute -right-[8%] top-[12%] h-[95%] w-[42%] -skew-x-[14deg] opacity-70"
        style={{ background: 'linear-gradient(200deg, #F5FAFF 0%, #EAF3FF 100%)' }}
      />
    </div>
  )
}

function AuthMarketingAside({ variant }: { variant: AuthMarketingVariant }) {
  const copy = MARKETING[variant]

  return (
    <aside
      className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex"
      style={{ backgroundColor: AUTH_UI.marketingBg }}
    >
      <MarketingBands />

      <div className="relative z-[1]">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Image
            src="/images/logo-zord-tight.png"
            alt="Arealis Zord"
            width={220}
            height={60}
            className="h-12 w-auto sm:h-14"
            priority
          />
        </Link>
      </div>

      <div className="relative z-[1] max-w-lg pb-4">
        <h2
          className="text-[32px] font-bold leading-[1.15] tracking-[-0.02em] xl:text-[36px]"
          style={{ color: AUTH_UI.headline }}
        >
          {copy.headline}
        </h2>
        <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-[14px] font-semibold" style={{ color: AUTH_UI.feature }}>
          {copy.features.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="text-[16px] font-bold leading-none" aria-hidden>
                +
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative z-[1] text-[12px] text-slate-500">© {new Date().getFullYear()} Arealis · Zord Console</p>
    </aside>
  )
}

function AuthFormBrandMark() {
  return (
    <div className="mb-7 flex justify-center lg:justify-start">
      <Image
        src="/images/logo-zord-tight.png"
        alt="Arealis Zord"
        width={200}
        height={55}
        className="h-11 w-auto sm:h-12"
        priority
      />
    </div>
  )
}

type AuthSplitLayoutProps = {
  variant: AuthMarketingVariant
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthSplitLayout({ variant, eyebrow, title, subtitle, children, footer }: AuthSplitLayoutProps) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <AuthMarketingAside variant={variant} />

      <main className="flex min-h-screen flex-col justify-center px-6 py-10 sm:px-12 lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-[420px]">
          <AuthFormBrandMark />

          <p className="text-[13px] font-medium text-slate-500">{eyebrow}</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-[-0.02em] text-slate-900 sm:text-[28px]">{title}</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-500">{subtitle}</p>

          <div className="mt-7">{children}</div>

          {footer ? <div className="mt-8">{footer}</div> : null}
        </div>
      </main>
    </div>
  )
}
