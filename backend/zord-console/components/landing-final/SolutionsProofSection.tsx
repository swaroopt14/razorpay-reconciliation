'use client'

import type { ReactNode } from 'react'
import { Activity, BadgeCheck, GitBranch, Network } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

function ProofCard({
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

function SubsystemListMock() {
  const rows = [
    { label: 'Bank rails', value: 'Multi-rail' },
    { label: 'Connector posture', value: 'Live health' },
    { label: 'Callback integrity', value: 'Verified' },
    { label: 'Evidence packs', value: 'Exportable' },
  ]

  return (
    <div className="mt-6 rounded-[1.25rem] border border-black/[0.05] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">Active paths overview</p>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 border-b border-black/[0.04] pb-3 last:border-0 last:pb-0">
            <span className="text-[13px] font-medium text-[#374151]">{row.label}</span>
            <span className="rounded-full bg-[#E8F8F5] px-2.5 py-1 text-[11px] font-semibold text-[#059669]">{row.value}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end">
        <div className="relative h-16 w-16">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="none" stroke="#E5E7EB" strokeWidth="6" />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="#34D399"
              strokeWidth="6"
              strokeDasharray="120 163"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#059669]">Live</span>
        </div>
      </div>
    </div>
  )
}

function NetworkMock() {
  return (
    <div className="relative mt-6 h-44 overflow-hidden rounded-[1.25rem] border border-black/[0.05] bg-white sm:h-52">
      <svg viewBox="0 0 400 180" className="h-full w-full" aria-hidden="true">
        <line x1="80" y1="90" x2="160" y2="50" stroke="#D1FAE5" strokeWidth="2" />
        <line x1="80" y1="90" x2="160" y2="130" stroke="#D1FAE5" strokeWidth="2" />
        <line x1="160" y1="50" x2="250" y2="90" stroke="#A7F3D0" strokeWidth="2" />
        <line x1="160" y1="130" x2="250" y2="90" stroke="#A7F3D0" strokeWidth="2" />
        <line x1="250" y1="90" x2="330" y2="90" stroke="#6EE7B7" strokeWidth="2.5" />
        <circle cx="80" cy="90" r="10" fill="#ECFDF5" stroke="#34D399" strokeWidth="2" />
        <circle cx="160" cy="50" r="9" fill="#F0FDF4" stroke="#86EFAC" strokeWidth="2" />
        <circle cx="160" cy="130" r="9" fill="#F0FDF4" stroke="#86EFAC" strokeWidth="2" />
        <circle cx="250" cy="90" r="12" fill="#D1FAE5" stroke="#10B981" strokeWidth="2" />
        <circle cx="330" cy="90" r="10" fill="#34D399" stroke="#059669" strokeWidth="2" />
      </svg>
      <span className="absolute left-4 top-4 rounded-full bg-[#34D399]/15 px-2.5 py-1 text-[10px] font-semibold text-[#059669]">
        Real-time adaptation
      </span>
      <span className="absolute bottom-4 right-4 rounded-full bg-[#34D399]/15 px-2.5 py-1 text-[10px] font-semibold text-[#059669]">
        Continuous proof
      </span>
    </div>
  )
}

export function SolutionsProofSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="mt-20 border-t border-black/[0.05] pt-20">
      <div className="mx-auto max-w-3xl text-center">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 text-[13px] text-[#111111]"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#34D399]/15 text-[#059669]">
            <GitBranch className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <span>Operator deployment at scale</span>
        </motion.div>

        <motion.h2
          initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="mt-6 text-3xl font-semibold tracking-[-0.05em] text-[#111111] sm:text-4xl lg:text-[2.75rem]"
        >
          Proven where payouts can&apos;t fail
        </motion.h2>

        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 text-base leading-relaxed text-[#6B7280] sm:text-lg"
        >
          A payout intelligence layer designed to simplify movement, surface truth, and close finance questions
          faster.
        </motion.p>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ProofCard delay={0.05}>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#34D399]/15 text-[#059669]">
              <Activity className="h-4 w-4" />
            </span>
            <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111111]">Live payout observation</h3>
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-[#6B7280]">
              Watch connector and bank state in real time across live disbursement flows — before queues turn into
              incidents.
            </p>
          </ProofCard>

          <ProofCard delay={0.15} className="flex-1">
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#111111]">Multi-rail coverage</h3>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#6B7280]">
              Rail and provider posture across the paths your operations actually use — not a dashboard that hides
              the break point.
            </p>
            <SubsystemListMock />
          </ProofCard>
        </div>

        <div className="flex flex-col gap-4">
          <ProofCard delay={0.1}>
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#111111]">Continuous finality tracking</h3>
            <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#6B7280]">
              From intent to bank confirmation, ZORD keeps movement and proof tied together as state evolves.
            </p>
            <NetworkMock />
          </ProofCard>

          <ProofCard delay={0.2}>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#34D399] text-white">
              <BadgeCheck className="h-4 w-4" />
            </span>
            <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111111]">Finance-grade precision</h3>
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-[#6B7280]">
              Proof paths, audit trails, and role-based controls — so ops, finance, and compliance share one defensible
              truth.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#34D399]/25 bg-[#E8F8F5] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#059669]">
              <Network className="h-3.5 w-3.5" />
              Evidence-ready
            </div>
          </ProofCard>
        </div>
      </div>
    </section>
  )
}
