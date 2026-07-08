'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'
import type { FinalLandingNavLabel } from '@/components/landing-final/FinalLandingNavbar'

type PageAction = {
  label: string
  href: string
  variant?: 'primary' | 'secondary'
}

type FinalLandingPageScaffoldProps = {
  active: FinalLandingNavLabel
  eyebrow: string
  title: string
  description: string
  primaryAction?: PageAction
  secondaryAction?: PageAction
  heroVisual?: HeroVisual
  children: ReactNode
}

type HeroVisualStat = {
  value: string
  label: string
}

export type HeroVisual = {
  src: string
  alt: string
  eyebrow: string
  title: string
  body: string
  stats?: HeroVisualStat[]
  imagePosition?: 'left' | 'right'
  imageClassName?: string
  theme?: 'light' | 'dark'
}

function PageActionButton({ label, href, variant = 'secondary', theme = 'dark' }: PageAction & { theme?: 'light' | 'dark' }) {
  const isLight = theme === 'light'
  const className =
    variant === 'primary'
      ? isLight
        ? 'inline-flex items-center justify-center rounded-full bg-[#111111] px-7 py-4 text-[15px] font-semibold text-white transition hover:bg-black/90 shadow-[0_12px_24px_rgba(0,0,0,0.1)]'
        : 'inline-flex items-center justify-center rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-black transition hover:bg-zinc-200'
      : isLight
      ? 'inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-7 py-4 text-[15px] font-semibold text-[#111111] transition hover:bg-black/[0.02]'
      : 'inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-7 py-4 text-[15px] font-semibold text-white transition hover:bg-white/[0.08]'

  return (
    <a href={href} className={className}>
      {label}
    </a>
  )
}

export function PageHeroVisual({
  src,
  alt,
  eyebrow,
  title,
  body,
  stats = [],
  imagePosition = 'left',
  imageClassName = 'object-cover object-center',
  theme = 'dark',
}: HeroVisual) {
  const isLight = theme === 'light'
  const imageOrder = imagePosition === 'right' ? 'lg:order-2' : ''
  const textOrder = imagePosition === 'right' ? 'lg:order-1' : ''

  return (
    <section className="mx-auto mt-12 max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.08 }}
        className="grid gap-6 lg:grid-cols-[1.04fr_0.96fr]"
      >
        <div className={`relative min-h-[420px] overflow-hidden rounded-[2.2rem] border ${isLight ? 'border-black/5' : 'border-white/10'} ${imageOrder}`}>
          <Image src={src} alt={alt} fill className={imageClassName} sizes="(min-width: 1280px) 576px, 100vw" />
          {isLight ? (
             <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.1)_42%,rgba(255,255,255,0.2)_100%)]" />
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,13,0.10)_0%,rgba(7,9,13,0.32)_42%,rgba(7,9,13,0.84)_100%)]" />
          )}
          <div className={`absolute inset-0 ${isLight ? 'bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.08),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.08),transparent_28%)]' : 'bg-[radial-gradient(circle_at_top_right,rgba(198,239,207,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.12),transparent_28%)]'}`} />
        </div>

        <div
          className={`relative overflow-hidden rounded-[2rem] border p-8 ${textOrder} ${isLight ? 'border-black/5 bg-white shadow-[0_32px_80px_rgba(0,0,0,0.04)]' : 'border-white/10'}`}
          style={!isLight ? {
            background:
              'linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
          } : undefined}
        >
          <div className={`pointer-events-none absolute inset-0 ${isLight ? 'bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.03),transparent_34%)]' : 'bg-[radial-gradient(circle_at_top_right,rgba(198,239,207,0.10),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.10),transparent_28%)]'}`} />

          <div className={`relative inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${isLight ? 'border-black/5 bg-black/[0.02] text-[#4B5563]' : 'border-white/10 bg-white/[0.05] text-slate-300'}`}>
            <span className={`h-2 w-2 rounded-full ${isLight ? 'bg-[#34D399]' : 'bg-[#c6efcf]'}`} />
            {eyebrow}
          </div>

          <h2 className={`relative mt-5 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl ${isLight ? 'text-[#111111]' : 'text-white'}`}>
            {title}
          </h2>
          <p className={`relative mt-5 text-[16px] leading-8 ${isLight ? 'text-[#4B5563]' : 'text-slate-400'}`}>{body}</p>

          {stats.length ? (
            <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className={`rounded-[1.2rem] border px-4 py-4 ${isLight ? 'border-black/5 bg-[#FAFAFA]' : 'border-white/10 bg-white/[0.04]'}`}>
                  <div className={`text-2xl font-semibold tracking-tight ${isLight ? 'text-[#111111]' : 'text-white'}`}>{stat.value}</div>
                  <div className={`mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${isLight ? 'text-[#9CA3AF]' : 'text-slate-400'}`}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </motion.div>
    </section>
  )
}

export function FinalLandingPageScaffold({
  active,
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  heroVisual,
  children,
}: FinalLandingPageScaffoldProps) {
  const theme = 'light'
  const isLight = theme === 'light'

  return (
    <div className={`min-h-screen overflow-x-hidden ${isLight ? 'bg-[#FAFAFA] text-[#1A1A1A]' : 'bg-[#05070a] text-white'}`}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {isLight ? (
           <>
             {/* Soft radial wash */}
             <div className="absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-[42%] rounded-full bg-[radial-gradient(circle,rgba(198,239,207,0.12)_0%,transparent_68%)]" />
             {/* Fine grid */}
             <div
               className="absolute inset-0 opacity-[0.25]"
               style={{
                 backgroundImage:
                   'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
                 backgroundSize: '72px 72px',
                 maskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 75%)',
                 WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 75%)',
               }}
             />
           </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(198,239,207,0.10),transparent_20%),linear-gradient(180deg,#06080b_0%,#05070a_100%)]" />
            <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:120px_120px]" />
          </>
        )}
      </div>

      <div className="relative z-10">
        <SolutionsSiteNav active={active} theme={theme} />
        <FinalLandingAssistantButton />

        <main className="px-2 pb-20 pt-[120px] md:px-3">
          <section className="mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65 }}
              className="max-w-4xl"
            >
              <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${isLight ? 'border-black/5 bg-black/[0.02] text-[#4B5563]' : 'border-white/10 bg-white/[0.05] text-slate-300'}`}>
                <span className={`h-2 w-2 rounded-full ${isLight ? 'bg-[#34D399]' : 'bg-[#c6efcf]'}`} />
                {eyebrow}
              </div>
              <h1 className={`mt-8 text-5xl font-semibold tracking-[-0.065em] sm:text-6xl lg:text-[5rem] lg:leading-[0.92] ${isLight ? 'text-[#111111]' : 'text-white'}`}>
                {title}
              </h1>
              <p className={`mt-8 max-w-3xl text-lg leading-relaxed sm:text-xl ${isLight ? 'text-[#4B5563]' : 'text-slate-300/82'}`}>{description}</p>

              {primaryAction || secondaryAction ? (
                <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                  {primaryAction ? <PageActionButton {...primaryAction} variant="primary" theme={theme} /> : null}
                  {secondaryAction ? <PageActionButton {...secondaryAction} theme={theme} /> : null}
                </div>
              ) : null}
            </motion.div>
          </section>

          {heroVisual ? <PageHeroVisual {...heroVisual} theme={theme} /> : null}

          {children}
        </main>

        <SolutionsSiteFooter theme={theme} />
      </div>
    </div>
  )
}
