'use client'

import Image from 'next/image'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ChevronDown, Check, LayoutGrid, Lock, MoreHorizontal, ShieldCheck, TrendingUp, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'

const { featuresSection: F } = landingHomeCopy

const SLOW_EASE = [0.22, 1, 0.36, 1] as const

const PILLAR_BACKGROUNDS = {
  connector: '/final-landing/hero/pillar-bg-connector.png',
  performance: '/final-landing/hero/pillar-bg-performance.png',
  evidence: '/final-landing/hero/pillar-bg-evidence.png',
} as const

const PILLAR_FRAME_CLASS = 'relative aspect-[4/5] w-full overflow-hidden rounded-[1.5rem]'

const GLASS_CARD_CLASS =
  'relative z-10 flex h-[318px] min-h-[318px] w-full max-w-[340px] flex-col overflow-hidden rounded-t-[1.125rem] rounded-b-[2.125rem] border border-white/20 bg-[rgba(18,22,32,0.78)] p-4 text-white shadow-[0_28px_64px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:p-[1.125rem]'

const CARD_OVERLAY_CLASS =
  'absolute inset-x-0 top-[48%] z-10 flex w-full items-center justify-center px-3 sm:top-[50%]'

const PILLAR_SHELL_CLASS = 'relative mx-auto mt-8 w-full max-w-[380px] overflow-visible pb-[5.5rem]'

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
    transition: { staggerChildren: 0.38, delayChildren: 0.15 },
  },
} as const

const pillarColumn = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2, delayChildren: 0.05 },
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

  const format = (n: number) => `${prefix}${n.toFixed(decimals)}${suffix}`

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

function GlassPanel({ children }: { children: ReactNode }) {
  return <div className={GLASS_CARD_CLASS}>{children}</div>
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
      <GlassPanel>
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

function PerformanceCard() {
  return (
    <AnimatedBlurShell backgroundSrc={PILLAR_BACKGROUNDS.performance}>
      <GlassPanel>
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

        <div className="mt-3 grid shrink-0 grid-cols-3 gap-1">
          {[
            { label: 'Matched', to: 12, prefix: '+', suffix: '%' },
            { label: 'Gaps', to: -3.1, prefix: '', suffix: '%' },
            { label: 'Proof', to: 8, prefix: '+', suffix: '%' },
          ].map(({ label, to, prefix, suffix }, index) => (
            <div key={label} className="text-center">
              <div className={LABEL}>{label}</div>
              <div className="mt-1">
                <CountUp to={Math.abs(to)} decimals={1} prefix={to < 0 ? '-' : prefix} suffix={suffix} delay={1.45 + index * 0.1} />
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>
    </AnimatedBlurShell>
  )
}

function EvidenceTrustCard() {
  const auditRows = [
    { who: 'A. Sharma', what: 'Evidence export', when: '12 Jan' },
    { who: 'Finance ops', what: 'Match review', when: '11 Jan' },
    { who: 'System', what: 'Consent logged', when: '10 Jan' },
    { who: 'Compliance', what: 'Pack sealed', when: '09 Jan' },
  ] as const

  return (
    <AnimatedBlurShell backgroundSrc={PILLAR_BACKGROUNDS.evidence}>
      <GlassPanel>
        <CardHeader icon={ShieldCheck} title="Trust & evidence" />

        <div className="mt-3 flex shrink-0 flex-wrap gap-1">
          {[
            { icon: Lock, label: 'TLS 1.3' },
            { icon: ShieldCheck, label: 'Verified' },
            { icon: Lock, label: 'E2E' },
          ].map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/8 px-1.5 py-0.5 text-[8px] font-medium text-white/75"
            >
              <Icon className="h-2.5 w-2.5" />
              {label}
            </span>
          ))}
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

          <div className="grid shrink-0 grid-cols-3 gap-1 border-y border-white/10 py-2">
            {[
              ['Events', '1,248'],
              ['Exports', '3 ready'],
              ['Chain', 'Verified'],
            ].map(([label, value]) => (
              <div key={label} className="text-center">
                <div className={LABEL}>{label}</div>
                <div className="mt-0.5 text-[10px] font-semibold text-white/85">{value}</div>
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
    <div className="mx-auto max-w-[1180px]">
      <motion.div
        className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end"
        variants={shouldReduceMotion ? undefined : headerContainer}
        initial={shouldReduceMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={{ once: true, amount: 0.35 }}
      >
        <motion.p
          variants={shouldReduceMotion ? undefined : fadeUpItem}
          className="mb-4 inline-flex w-fit rounded border border-[#E5E7EB] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#9CA3AF] lg:col-span-2"
        >
          Payout intelligence
        </motion.p>
        <motion.h2
          variants={shouldReduceMotion ? undefined : fadeUpItem}
          className="max-w-[14ch] text-[2rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[#1A1A1A] sm:text-[2.5rem] lg:text-[2.85rem]"
        >
          {F.headline}
        </motion.h2>
        <motion.p
          variants={shouldReduceMotion ? undefined : fadeUpItem}
          className="max-w-md text-base leading-relaxed text-[#666666] sm:text-lg"
        >
          {F.subcopy}
        </motion.p>
      </motion.div>

      <motion.div
        className="mt-14 grid w-full grid-cols-1 gap-6 overflow-visible md:grid-cols-3 md:gap-6 lg:mt-16 lg:gap-8 justify-items-center justify-center mx-auto"
        variants={shouldReduceMotion ? undefined : pillarGrid}
        initial={shouldReduceMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={{ once: true, amount: 0.12 }}
      >
        {pillars.map((pillar, index) => (
          <motion.div
            key={pillar.title}
            className="flex w-full flex-col items-center overflow-visible"
            variants={shouldReduceMotion ? undefined : pillarColumn}
          >
            <div className="w-full self-stretch">
              <motion.p variants={shouldReduceMotion ? undefined : pillarText} className="text-[12px] font-medium tracking-[0.08em] text-[#9CA3AF]">
                [ {index + 1} ]
              </motion.p>
              <motion.h3
                variants={shouldReduceMotion ? undefined : pillarText}
                className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#1A1A1A] sm:text-[1.35rem]"
              >
                {pillar.title}
              </motion.h3>
              <motion.p variants={shouldReduceMotion ? undefined : pillarText} className="mt-3 text-[15px] leading-relaxed text-[#666666]">
                {pillar.description}
              </motion.p>
            </div>
            <motion.div
              className="flex w-full items-center justify-center"
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
      className="relative z-10 bg-[#F8F9FA] px-6 py-16 text-[#1A1A1A] sm:px-10 sm:py-20 lg:px-12 lg:py-24 scroll-mt-32"
      aria-label="Product capabilities preview"
    >
      <LandingThreePillars />
    </section>
  )
}
