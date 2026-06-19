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
}

function PageActionButton({ label, href, variant = 'secondary' }: PageAction) {
  const className =
    variant === 'primary'
      ? 'inline-flex items-center justify-center rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-black transition hover:bg-zinc-200'
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
}: HeroVisual) {
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
        <div className={`relative min-h-[420px] overflow-hidden rounded-[2.2rem] border border-white/10 ${imageOrder}`}>
          <Image src={src} alt={alt} fill className={imageClassName} sizes="(min-width: 1280px) 576px, 100vw" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,9,13,0.10)_0%,rgba(7,9,13,0.32)_42%,rgba(7,9,13,0.84)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(198,239,207,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.12),transparent_28%)]" />
        </div>

        <div
          className={`relative overflow-hidden rounded-[2rem] border border-white/10 p-8 ${textOrder}`}
          style={{
            background:
              'linear-gradient(180deg, rgba(22,28,38,0.94) 0%, rgba(11,13,18,0.98) 100%)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(198,239,207,0.10),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.10),transparent_28%)]" />

          <div className="relative inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            <span className="h-2 w-2 rounded-full bg-[#c6efcf]" />
            {eyebrow}
          </div>

          <h2 className="relative mt-5 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
            {title}
          </h2>
          <p className="relative mt-5 text-[16px] leading-8 text-slate-400">{body}</p>

          {stats.length ? (
            <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-4">
                  <div className="text-2xl font-semibold tracking-tight text-white">{stat.value}</div>
                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
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
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05070a] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(198,239,207,0.10),transparent_20%),linear-gradient(180deg,#06080b_0%,#05070a_100%)]" />
        <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:120px_120px]" />
      </div>

      <div className="relative z-10">
        <SolutionsSiteNav active={active} />
        <FinalLandingAssistantButton />

        <main className="px-2 pb-20 pt-[150px] md:px-3">
          <section className="mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
              className="max-w-4xl"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                <span className="h-2 w-2 rounded-full bg-[#c6efcf]" />
                {eyebrow}
              </div>
              <h1 className="mt-6 text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl lg:text-[4.7rem] lg:leading-[0.96]">
                {title}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300/82 sm:text-xl">{description}</p>

              {primaryAction || secondaryAction ? (
                <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                  {primaryAction ? <PageActionButton {...primaryAction} variant="primary" /> : null}
                  {secondaryAction ? <PageActionButton {...secondaryAction} /> : null}
                </div>
              ) : null}
            </motion.div>
          </section>

          {heroVisual ? <PageHeroVisual {...heroVisual} /> : null}

          {children}
        </main>

        <SolutionsSiteFooter />
      </div>
    </div>
  )
}
