'use client'

import Image from 'next/image'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ChevronDown, Check, LayoutGrid, Lock, MoreHorizontal, ShieldCheck, TrendingUp, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import { LANDING_SECTION_SHELL } from '@/components/landing-final/landingSectionLayout'

const { featuresSection: F } = landingHomeCopy

const SLOW_EASE = [0.22, 1, 0.36, 1] as const

const PILLAR_BACKGROUNDS = {
  connector: '/final-landing/hero/pillar-bg-connector.png',
  performance: '/final-landing/hero/pillar-bg-performance.png',
  evidence: '/final-landing/hero/pillar-bg-evidence.png',
} as const

const PILLAR_FRAME_CLASS = 'relative aspect-[4/4.65] w-full overflow-hidden rounded-[1.5rem]'

const GLASS_CARD_BASE =
  'relative z-10 flex h-[296px] min-h-[296px] w-full flex-col overflow-hidden rounded-t-[1.125rem] rounded-b-[2.125rem] border p-4 text-white shadow-[0_28px_64px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:p-[1.125rem]'

/** Per-pillar glass material — each card picks up its photo's hue (blue / near-black / warm sand). */
const GLASS_TONES = {
  frost: 'border-white/25 bg-[rgba(42,64,102,0.72)]',
  dark: 'border-white/12 bg-[rgba(13,19,13,0.8)]',
  warm: 'border-white/30 bg-[rgba(96,84,70,0.66)]',
} as const

type GlassTone = keyof typeof GLASS_TONES

const CARD_OVERLAY_CLASS =
  'absolute inset-x-0 top-[44%] z-10 flex w-full items-center justify-center px-3 sm:top-[46%]'

const PILLAR_SHELL_CLASS = 'relative w-full max-w-none overflow-visible pb-[4.5rem]'

/** Shared content width — hero + pillars align on one grid. */
const SECTION_SHELL = LANDING_SECTION_SHELL

const LABEL = 'text-[9px] font-medium uppercase tracking-[0.1em] text-white/50'
const VALUE = 'text-[11px] font-semibold leading-tight text-white'
const BODY = 'text-[10px] leading-relaxed text-white/55'

const headerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2, delayChildren: 0.08 },
  },
} as const

const fadeUpItem = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.55, ease: SLOW_EASE },
  },
} as const

const pillarGrid = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.48, delayChildren: 0.55 },
  },
} as const

const pillarColumn = {
  hidden: { opacity: 0, y: 72 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.45, ease: SLOW_EASE, staggerChildren: 0.22, delayChildren: 0.08 },
  },
} as const

const pillarText = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.25, ease: SLOW_EASE },
  },
} as const

function CountUp({
  to,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = VALUE,
  delay = 1.25,
  duration = 2.8,
}: {
  to: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
  delay?: number
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.45 })
  const shouldReduceMotion = useReducedMotion()

  const format = (n: number) =>
    `${prefix}${n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`

  const [display, setDisplay] = useState(() => (shouldReduceMotion ? format(to) : format(0)))

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplay(format(to))
      return
    }
    if (!inView) return

    let frame = 0
    let start: number | null = null
    const delayMs = delay * 1000
    const durationMs = duration * 1000

    const tick = (time: number) => {
      if (start === null) start = time
      const elapsed = time - start - delayMs
      if (elapsed < 0) {
        frame = requestAnimationFrame(tick)
        return
      }
      const progress = Math.min(elapsed / durationMs, 1)
      const eased = 1 - (1 - progress) ** 3
      setDisplay(progress >= 1 ? format(to) : format(to * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, shouldReduceMotion, to, decimals, prefix, suffix, delay, duration])

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  )
}

function GlassPanel({ tone = 'dark', children }: { tone?: GlassTone; children: ReactNode }) {
  return <div className={`${GLASS_CARD_BASE} ${GLASS_TONES[tone]}`}>{children}</div>
}

function CardHeader({
  icon: Icon,
  title,
  trailing,
}: {
  icon: LucideIcon
  title: string
  trailing?: ReactNode
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/12">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <span className="truncate text-[12px] font-semibold tracking-[-0.01em]">{title}</span>
      </div>
      {trailing ?? (
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-white/55" aria-hidden>
          <MoreHorizontal className="h-4 w-4" />
        </span>
      )}
    </div>
  )
}

function AnimatedBlurShell({ backgroundSrc, children }: { backgroundSrc: string; children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null)
  const inView = useInView(shellRef, { once: true, amount: 0.28 })
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return (
      <div className={PILLAR_SHELL_CLASS}>
        <div className={PILLAR_FRAME_CLASS}>
          <Image src={backgroundSrc} alt="" fill className="object-cover object-center" sizes="(min-width: 1024px) 320px, 30vw" aria-hidden />
        </div>
        <div className={CARD_OVERLAY_CLASS}>{children}</div>
      </div>
    )
  }

  return (
    <div ref={shellRef} className={PILLAR_SHELL_CLASS}>
      <motion.div
        className={PILLAR_FRAME_CLASS}
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={inView ? { opacity: 1, y: 0, scale: 1 } : undefined}
        transition={{ duration: 1.65, ease: SLOW_EASE }}
      >
        <Image
          src={backgroundSrc}
          alt=""
          fill
          className="object-cover object-center"
          sizes="(min-width: 1024px) 320px, 30vw"
          aria-hidden
        />
      </motion.div>
      <motion.div
        className={CARD_OVERLAY_CLASS}
        initial={{ opacity: 0, y: 72 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 1.75, delay: 0.55, ease: SLOW_EASE }}
      >
        {children}
      </motion.div>
    </div>
  )
}

function AnimatedBars({ bars, barDelay = 1.35 }: { bars: number[]; barDelay?: number }) {
  const barsRef = useRef<HTMLDivElement>(null)
  const inView = useInView(barsRef, { once: true, amount: 0.5 })
  const shouldReduceMotion = useReducedMotion()

  return (
    <div ref={barsRef} className="mt-3 flex h-[84px] shrink-0 items-end gap-[3px]">
      {bars.map((height, index) =>
        shouldReduceMotion ? (
          <span
            key={index}
            className="flex-1 rounded-t-[2px] bg-gradient-to-t from-white/20 to-white/85"
            style={{ height: `${height}%` }}
          />
        ) : (
          <motion.span
            key={index}
            className="flex-1 origin-bottom rounded-t-[2px] bg-gradient-to-t from-white/20 to-white/85"
            initial={{ scaleY: 0 }}
            animate={inView ? { scaleY: 1 } : undefined}
            transition={{ duration: 1.25, delay: barDelay + index * 0.05, ease: SLOW_EASE }}
            style={{ height: `${height}%` }}
          />
        ),
      )}
    </div>
  )
}

function PayoutOverviewCard() {
  const bars = [38, 52, 44, 68, 58, 72, 48, 64, 42, 56, 50]

  return (
    <AnimatedBlurShell backgroundSrc={PILLAR_BACKGROUNDS.connector}>
      <GlassPanel tone="frost">
        <CardHeader icon={LayoutGrid} title="Payout overview" />

        <div className="mt-3.5 grid shrink-0 grid-cols-3 gap-2 border-b border-white/10 pb-3">
          <div>
            <div className={LABEL}>Total value</div>
            <div className="mt-1">
              <CountUp to={3.45} decimals={2} prefix="₹" suffix=" Cr" delay={1.3} />
            </div>
          </div>
          <div>
            <div className={LABEL}>Period change</div>
            <div className="mt-1">
              <CountUp to={24.8} decimals={1} prefix="+₹" suffix=" L" delay={1.42} />
            </div>
          </div>
          <div>
            <div className={LABEL}>Connectors</div>
            <div className="mt-1">
              <CountUp to={12} decimals={0} delay={1.54} />
            </div>
          </div>
        </div>

        <AnimatedBars bars={bars} />

        <div className="mt-3 flex flex-1 flex-col space-y-2 border-t border-white/10 pt-2.5">
          {[
            ['Razorpay', 'Stable'],
            ['Cashfree', 'Watch'],
            ['PayU', 'Review'],
            ['Stripe', 'Stable'],
          ].map(([name, status]) => (
            <div key={name} className="flex items-center justify-between text-[10px]">
              <span className="text-white/90">{name}</span>
              <span className="text-white/45">{status}</span>
            </div>
          ))}
        </div>
      </GlassPanel>
    </AnimatedBlurShell>
  )
}

function PerformanceCardGlass() {
  return (
    <GlassPanel tone="dark">
      <CardHeader
        icon={Zap}
        title="Performance"
        trailing={
          <div className="flex items-center gap-0.5">
            <span className="inline-flex items-center gap-0.5 rounded-md border border-white/12 bg-white/8 px-1.5 py-1 text-[9px] text-white/65">
              Last week
              <ChevronDown className="h-2.5 w-2.5" />
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center text-white/55" aria-hidden>
              <MoreHorizontal className="h-4 w-4" />
            </span>
          </div>
        }
      />

      <div className="mt-3.5 flex shrink-0 items-end gap-1.5">
        <CountUp
          to={94.2}
          decimals={1}
          suffix="%"
          className="text-[2.1rem] font-semibold leading-none tracking-[-0.05em] text-white"
          delay={1.3}
          duration={3}
        />
        <TrendingUp className="mb-1 h-4 w-4 text-emerald-400" />
      </div>
      <p className="mt-1 shrink-0 text-[9px] text-white/45">Match confidence · last 7 days</p>

      <div className="mt-3 flex flex-1 flex-col gap-3 border-b border-white/10 pb-3">
        <div>
          <p className="text-[11px] font-semibold text-white/88">Payment health insights</p>
          <p className={`mt-1.5 ${BODY}`}>
            Confidence across instructions, bank confirmation, and review queues in one frame.
          </p>
        </div>
        <div className="space-y-2">
          {[
            ['Instruction match', '1,248 routed'],
            ['Bank confirmation', 'Stable across rails'],
            ['Review queue', '42 items open'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-white/75">{label}</span>
              <span className="shrink-0 text-white/45">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-3 gap-1 border-t border-dashed border-white/15 pt-2.5">
        {[
          { label: 'Matched', to: 12, prefix: '+', suffix: '%', up: true },
          { label: 'Gaps', to: -3.1, prefix: '', suffix: '%', up: false },
          { label: 'Proof', to: 8, prefix: '+', suffix: '%', up: true },
        ].map(({ label, to, prefix, suffix, up }, index) => (
          <div key={label} className="text-center">
            <div className={LABEL}>{label}</div>
            <div className="mt-1 flex items-center justify-center gap-0.5">
              <CountUp to={Math.abs(to)} decimals={1} prefix={to < 0 ? '-' : prefix} suffix={suffix} delay={1.45 + index * 0.1} />
              <TrendingUp
                className={`h-2.5 w-2.5 shrink-0 ${up ? 'text-emerald-400' : 'rotate-180 text-amber-400/90'}`}
              />
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}

function PerformanceCard() {
  return (
    <AnimatedBlurShell backgroundSrc={PILLAR_BACKGROUNDS.performance}>
      <PerformanceCardGlass />
    </AnimatedBlurShell>
  )
}

function EvidenceTrustCard() {
  const auditRows = [
    { who: 'A. Sharma', what: 'Evidence export', when: '12 Jan' },
    { who: 'Finance ops', what: 'Match review', when: '11 Jan' },
    { who: 'System', what: 'Consent logged', when: '10 Jan' },
  ] as const

  return (
    <AnimatedBlurShell backgroundSrc={PILLAR_BACKGROUNDS.evidence}>
      <GlassPanel tone="warm">
        <CardHeader
          icon={ShieldCheck}
          title="Trust & evidence"
          trailing={
            <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[8px] font-medium text-white/80">
              <Lock className="h-2.5 w-2.5" />
              TLS 1.3
            </span>
          }
        />

        <div className="mt-3 shrink-0">
          <CountUp
            to={1248}
            decimals={0}
            className="text-[2.1rem] font-semibold leading-none tracking-[-0.05em] text-white"
            delay={1.3}
            duration={3}
          />
          <p className="mt-1.5 flex items-center gap-1.5 text-[9px] text-white/60">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
            Audit events · chain verified
          </p>
        </div>

        <div className="mt-3 flex flex-1 flex-col gap-2.5 min-h-0">
          <div className="flex-1 overflow-hidden rounded-xl border border-white/12 bg-black/15">
            <div className="grid grid-cols-[0.9fr_1.1fr_0.7fr] gap-1 border-b border-white/10 px-2 py-1.5">
              <span className={LABEL}>Who</span>
              <span className={LABEL}>What</span>
              <span className={`${LABEL} text-right`}>When</span>
            </div>
            {auditRows.map((row) => (
              <div
                key={`${row.who}-${row.when}`}
                className="grid grid-cols-[0.9fr_1.1fr_0.7fr] gap-1 border-b border-white/6 px-2 py-1.5 text-[9px] last:border-b-0"
              >
                <span className="truncate font-medium text-white/90">{row.who}</span>
                <span className="truncate text-white/60">{row.what}</span>
                <span className="truncate text-right text-white/45">{row.when}</span>
              </div>
            ))}
          </div>

          <div className="shrink-0 rounded-xl border border-white/10 bg-white/6 p-2.5">
            <p className={LABEL}>Consent on file</p>
            <div className="mt-1.5 flex gap-2">
              <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border border-emerald-400/50 bg-emerald-500/15">
                <Check className="h-2.5 w-2.5 text-emerald-300" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="text-[9px] leading-snug text-white/82">
                  I authorize export of payment evidence for audit review.
                </p>
                <p className="mt-0.5 text-[8px] text-white/45">10 Jan 2026 · 14:32 IST</p>
              </div>
            </div>
          </div>
        </div>
      </GlassPanel>
    </AnimatedBlurShell>
  )
}

function PillarVisual({ index }: { index: number }) {
  if (index === 0) return <PayoutOverviewCard />
  if (index === 1) return <PerformanceCard />
  return <EvidenceTrustCard />
}

function LandingThreePillars() {
  const pillars = landingHomeCopy.capabilities
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className={SECTION_SHELL}>
      <motion.div
        variants={shouldReduceMotion ? undefined : headerContainer}
        initial={shouldReduceMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={{ once: true, amount: 0.28 }}
      >
        <motion.p
          variants={shouldReduceMotion ? undefined : fadeUpItem}
          className="mb-8 inline-flex w-fit rounded border border-[#111111] bg-[#111111] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white"
        >
          Payout intelligence
        </motion.p>

        <div className="grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-start lg:gap-x-14 xl:gap-x-20">
          <motion.h2
            variants={shouldReduceMotion ? undefined : fadeUpItem}
            className="max-w-[15ch] text-[2.5rem] font-semibold leading-[0.94] tracking-[-0.04em] text-[#1A1A1A] sm:text-[3.25rem] lg:text-[4.5rem]"
          >
            {F.headline}
          </motion.h2>
          <motion.p
            variants={shouldReduceMotion ? undefined : fadeUpItem}
            className="max-w-xl text-base font-medium leading-relaxed text-[#4B5563] sm:text-lg lg:max-w-[30rem] lg:pt-1"
          >
            {F.subcopy}
          </motion.p>
        </div>
      </motion.div>

      <motion.div
        className="mt-16 grid w-full grid-cols-1 gap-8 overflow-visible md:grid-cols-3 md:items-start md:gap-6 lg:mt-16 lg:gap-10"
        variants={shouldReduceMotion ? undefined : pillarGrid}
        initial={shouldReduceMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={{ once: true, amount: 0.08 }}
      >
        {pillars.map((pillar, index) => (
          <motion.div
            key={pillar.title}
            className="flex w-full min-w-0 flex-col items-start overflow-visible"
            variants={shouldReduceMotion ? undefined : pillarColumn}
          >
            <motion.div className="w-full min-w-0">
              <motion.p
                variants={shouldReduceMotion ? undefined : pillarText}
                className="text-[10px] font-medium tracking-[0.1em] text-[#B8BFCA]"
              >
                [ {index + 1} ]
              </motion.p>
              <motion.h3
                variants={shouldReduceMotion ? undefined : pillarText}
                className="mt-5 max-w-[22ch] text-xl font-semibold tracking-[-0.03em] text-[#1A1A1A] sm:text-[1.35rem]"
              >
                {pillar.title}
              </motion.h3>
              <motion.p
                variants={shouldReduceMotion ? undefined : pillarText}
                className="mt-[18px] max-w-[34ch] text-[15px] leading-relaxed text-[#4B5563]"
              >
                {pillar.description}
              </motion.p>
            </motion.div>

            <motion.div
              className="mt-6 flex w-full items-start justify-start"
              variants={shouldReduceMotion ? undefined : { hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            >
              <PillarVisual index={index} />
            </motion.div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}

export function LandingScrollRevealSection() {
  return (
    <section
      id="product"
      className="relative z-10 overflow-visible py-16 pb-24 sm:py-20 sm:pb-28 lg:py-24 lg:pb-32 scroll-mt-32"
      aria-label="Product capabilities preview"
    >
      <LandingThreePillars />
    </section>
  )
}
