'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, GitBranch, LineChart, Shield } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

function BentoCard({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.article
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, delay }}
      className={`overflow-hidden rounded-[1.75rem] border border-black/[0.05] bg-[#F7F8FA] p-6 sm:p-7 ${className}`}
    >
      {children}
    </motion.article>
  )
}

function RailOverviewMock() {
  const rows = [
    { label: 'Payout obligations', metric: 'Received', detail: 'Source captured' },
    { label: 'Outcome signals', metric: 'Exact outcome', detail: 'Expected vs observed' },
    { label: 'Payment exceptions', metric: 'Queued', detail: 'Human review required' },
    { label: 'Evidence packs', metric: 'Proof-ready', detail: 'Evidence complete' },
  ]

  return (
    <div className="mt-6 rounded-[1.25rem] border border-black/[0.05] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">PAYOUT LIFECYCLE OVERVIEW</p>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-black/[0.04] pb-3 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#374151]">{row.label}</p>
              <p className="text-[11px] text-[#9CA3AF]">{row.detail}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#E8F8F5] px-2.5 py-1 text-[11px] font-semibold text-[#059669]">
              {row.metric}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-end justify-between gap-4">
        <p className="max-w-[10rem] text-[11px] leading-relaxed text-[#9CA3AF]">
          Rail posture your ops team can act on, not a static integration map.
        </p>
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r="30" fill="none" stroke="#E5E7EB" strokeWidth="7" />
            <circle
              cx="40"
              cy="40"
              r="30"
              fill="none"
              stroke="#34D399"
              strokeWidth="7"
              strokeDasharray="140 188"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#059669]">
            Live
          </span>
        </div>
      </div>
    </div>
  )
}

function ProofNetworkMock() {
  return (
    <div className="relative mt-6 h-44 overflow-hidden rounded-[1.25rem] border border-black/[0.05] bg-white sm:h-52">
      <svg viewBox="0 0 400 180" className="h-full w-full" aria-hidden="true">
        <line x1="70" y1="90" x2="155" y2="45" stroke="#D1FAE5" strokeWidth="2" />
        <line x1="70" y1="90" x2="155" y2="135" stroke="#D1FAE5" strokeWidth="2" />
        <line x1="155" y1="45" x2="245" y2="90" stroke="#A7F3D0" strokeWidth="2" />
        <line x1="155" y1="135" x2="245" y2="90" stroke="#A7F3D0" strokeWidth="2" />
        <line x1="245" y1="90" x2="335" y2="90" stroke="#6EE7B7" strokeWidth="2.5" />
        <circle cx="70" cy="90" r="10" fill="#ECFDF5" stroke="#34D399" strokeWidth="2" />
        <circle cx="155" cy="45" r="9" fill="#F0FDF4" stroke="#86EFAC" strokeWidth="2" />
        <circle cx="155" cy="135" r="9" fill="#F0FDF4" stroke="#86EFAC" strokeWidth="2" />
        <circle cx="245" cy="90" r="12" fill="#D1FAE5" stroke="#10B981" strokeWidth="2" />
        <circle cx="335" cy="90" r="10" fill="#34D399" stroke="#059669" strokeWidth="2" />
      </svg>
      <span className="absolute left-4 top-4 rounded-full bg-[#34D399]/15 px-2.5 py-1 text-[10px] font-semibold text-[#059669]">
        Continuous proof
      </span>
      <span className="absolute bottom-4 right-4 rounded-full bg-[#34D399]/15 px-2.5 py-1 text-[10px] font-semibold text-[#059669]">
        Real-time adaptation
      </span>
    </div>
  )
}

export function SolutionsInstitutionalSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="mt-20 bg-white px-2 py-4 sm:px-0">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-[#111111]"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#34D399]/15 text-[#059669]">
              <GitBranch className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <span>Institutional deployment at scale</span>
          </motion.div>

          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-6 text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.055em] text-[#111111] sm:text-5xl"
          >
            Built for institutional{' '}
            <span className="bg-[linear-gradient(90deg,#059669_0%,#34D399_50%,#6EE7B7_100%)] bg-clip-text text-transparent">
              requirements
            </span>
          </motion.h2>

          <motion.p
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-base leading-relaxed text-[#6B7280] sm:text-lg"
          >
            A payout intelligence layer designed to simplify movement, surface truth, and meet the bar regulated
            partners expect.
          </motion.p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <BentoCard delay={0.05}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#34D399]/15 text-[#059669]">
                <Shield className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111111]">Regulatory compliance</h3>
              <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-[#6B7280]">
                Governed access, audit trails, and role-based controls for regulated partners and internal review teams.
              </p>
            </BentoCard>

            <BentoCard delay={0.15} className="flex-1">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#111111]">Scalability &amp; reliability</h3>
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#6B7280]">
                Multi-rail payout operations with connector posture you can act on, built for 24/7 money movement.
              </p>
              <RailOverviewMock />
            </BentoCard>
          </div>

          <div className="flex flex-col gap-4">
            <BentoCard delay={0.1}>
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#111111]">Performance &amp; transparency</h3>
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#6B7280]">
                Real-time movement truth with Evidence Packs finance can export when the question is &ldquo;what
                actually happened?&rdquo;
              </p>
              <ProofNetworkMock />
            </BentoCard>

            <BentoCard delay={0.2}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#34D399] text-white">
                <BadgeCheck className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111111]">Institutional-grade precision</h3>
              <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-[#6B7280]">
                Layers of risk management, proof paths, and compliance controls, so ops, finance, and audit share one
                defensible truth.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#34D399]/25 bg-[#E8F8F5] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#059669]">
                <LineChart className="h-3.5 w-3.5" />
                Evidence-ready
              </div>
            </BentoCard>
          </div>
        </div>

        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-14 flex flex-col items-center text-center"
        >
          <p className="max-w-xl text-[15px] leading-relaxed text-[#6B7280]">
            Deploy ZORD with your team. Book a demo for rollout depth, or keep exploring the catalog above.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white px-6 py-3 text-[14px] font-semibold text-[#111111] shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition hover:bg-black/[0.02]"
          >
            Home
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
