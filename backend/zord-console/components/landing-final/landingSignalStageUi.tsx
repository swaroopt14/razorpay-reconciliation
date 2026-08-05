'use client'

import { motion, useReducedMotion, type MotionValue } from 'framer-motion'
import { ArrowRight, Info } from 'lucide-react'

const SLOW_EASE = [0.22, 1, 0.36, 1] as const

const INTELLIGENCE_METRICS = [
  { label: 'Settlement health', value: 'Healthy', accent: true },
  { label: 'Waiting on bank', value: '18' },
  { label: 'Needs a person', value: '41' },
  { label: 'Lined up this week', value: '96%' },
] as const

function GlassDivider({ delay = 0, animate }: { delay?: number; animate: boolean }) {
  const shouldReduceMotion = useReducedMotion()
  const show = shouldReduceMotion || animate

  return (
    <motion.hr
      initial={shouldReduceMotion ? false : { scaleX: 0, opacity: 0 }}
      animate={show ? { scaleX: 1, opacity: 1 } : undefined}
      transition={{ duration: 0.85, delay, ease: SLOW_EASE }}
      className="my-6 h-px w-full origin-left border-0 bg-white/[0.12]"
      aria-hidden
    />
  )
}

/** Premium glassmorphism intelligence card - floats above the branch stage. */
export function RiskIntelligenceCard({ animate }: { animate: boolean }) {
  const shouldReduceMotion = useReducedMotion()
  const show = shouldReduceMotion || animate

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 28, scale: 0.97 }}
      animate={show ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={{ duration: 1.15, ease: SLOW_EASE }}
      className="relative w-full overflow-hidden rounded-[30px] border border-white/[0.12] bg-[rgba(16,18,20,0.55)] p-8 text-white shadow-[0_32px_80px_rgba(0,0,0,0.28),0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-[22px] [-webkit-backdrop-filter:blur(22px)]"
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[30px] bg-gradient-to-br from-white/[0.07] via-transparent to-transparent"
        aria-hidden
      />

      <div className="relative">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={show ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.9, delay: 0.08, ease: SLOW_EASE }}
          className="flex items-start justify-between gap-4"
        >
          <div className="min-w-0 flex-1">
            <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.03em] text-white">
              Payment health
            </h3>
            <p className="mt-3 max-w-[30ch] text-sm font-medium leading-[1.55] text-white/80">
              A live view of payment health, bank confirmations, and items that need a person.
            </p>
          </div>
          <button
            type="button"
            aria-label="About Payment health"
            className="mt-0.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-white/55 transition-colors duration-150 hover:border-white/20 hover:bg-white/[0.1] hover:text-white/80 focus:outline-none focus:ring-2 focus:ring-white/25"
          >
            <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </motion.div>

        <GlassDivider delay={0.18} animate={animate} />

        <div className="space-y-5">
          {INTELLIGENCE_METRICS.map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
              animate={show ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.8, delay: 0.22 + index * 0.1, ease: SLOW_EASE }}
              className="flex items-center justify-between gap-6"
            >
              <span className="text-base font-medium text-white/92">{metric.label}</span>
              <span
                className={`text-[13px] font-normal tabular-nums ${
                  'accent' in metric && metric.accent ? 'text-emerald-400/95' : 'text-white/65'
                }`}
              >
                {metric.value}
              </span>
            </motion.div>
          ))}
        </div>

        <GlassDivider delay={0.58} animate={animate} />

        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
          animate={show ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.85, delay: 0.62, ease: SLOW_EASE }}
          className="space-y-2"
        >
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-white/45">Suggested next check</p>
          <p className="text-sm font-medium leading-[1.55] text-white/88">
            18 payments are waiting on bank confirmation longer than usual.
          </p>
        </motion.div>

        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={show ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.8, delay: 0.78, ease: SLOW_EASE }}
          className="mt-6 flex items-center gap-2.5"
        >
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            {!shouldReduceMotion ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/40 opacity-75" />
            ) : null}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <p className="text-[13px] font-normal text-white/65">Watching payment health in real time.</p>
        </motion.div>
      </div>
    </motion.div>
  )
}

/** Floating stat + alert cards around the intelligence panel. */
export function SignalFloatingOverlays({ opacity }: { opacity?: MotionValue<number> }) {
  const shouldReduceMotion = useReducedMotion()

  const content = (
    <>
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20, x: -12 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 1.1, delay: 0.35, ease: SLOW_EASE }}
        className="absolute -left-10 top-14 z-20 w-[228px] rounded-[1.35rem] border border-white/[0.55] bg-white/[0.78] p-4 shadow-[0_24px_56px_rgba(20,30,20,0.2)] backdrop-blur-xl sm:-left-48 sm:top-16 lg:-left-56 lg:top-14"
      >
        <div className="flex items-start justify-between">
          <span className="text-[1.55rem] font-semibold leading-none tracking-[-0.04em] text-[#1A1A1A]">
            +₹12,840
          </span>
          <Info className="mt-0.5 h-3.5 w-3.5 text-[#9CA3AF]" strokeWidth={1.75} />
        </div>
        <p className="mt-1.5 text-[12px] text-[#666666]">Recovered gap amount</p>
        <button
          type="button"
          className="mt-3 flex w-full cursor-pointer items-center justify-between rounded-full bg-[#111111] py-2.5 pl-4 pr-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-black focus:outline-none focus:ring-2 focus:ring-[#111] focus:ring-offset-2"
        >
          Open gap
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/16">
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
        </button>
      </motion.div>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16, x: 12 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 1.05, delay: 0.48, ease: SLOW_EASE }}
        className="absolute -right-6 bottom-28 z-20 w-[220px] overflow-hidden rounded-[1.2rem] border border-white/[0.45] bg-white/[0.62] shadow-[0_22px_48px_rgba(20,30,20,0.18)] backdrop-blur-xl sm:-right-32 lg:-right-40"
      >
        <div className="border-b border-black/[0.06] bg-white/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6B7280]">
          Risk alert
        </div>
        <p className="px-4 py-3 text-[12px] leading-relaxed text-[#374151]">
          Confirmation delay detected on UPI
        </p>
      </motion.div>
    </>
  )

  if (shouldReduceMotion || !opacity) {
    return <div className="pointer-events-none absolute inset-0">{content}</div>
  }

  return (
    <motion.div className="pointer-events-none absolute inset-0" style={{ opacity }}>
      {content}
    </motion.div>
  )
}
