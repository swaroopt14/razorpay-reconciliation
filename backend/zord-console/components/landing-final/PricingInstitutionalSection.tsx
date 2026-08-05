'use client'

import type { ReactNode } from 'react'
import { BadgeCheck, Building2, Shield, Users } from 'lucide-react'
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

const comparison = [
  { label: 'Commercial model', sandbox: 'Evaluation', growth: 'Annual agreement', enterprise: 'Custom bands' },
  { label: 'Workspace access', sandbox: 'Preview data', growth: 'Production', enterprise: 'Production + custom' },
  { label: 'Evidence Packs', sandbox: 'Preview flows', growth: 'Production exports', enterprise: 'Custom export design' },
  { label: 'Implementation', sandbox: 'Docs + demo', growth: 'Priority onboarding', enterprise: 'White-glove rollout' },
  { label: 'Security review', sandbox: 'Self-serve docs', growth: 'Guided responses', enterprise: 'Dedicated review help' },
] as const

export function PricingInstitutionalSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="mt-20 bg-white py-4">
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
              <Building2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <span>Built for enterprise buyers</span>
          </motion.div>

          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-6 text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.055em] text-[#111111] sm:text-5xl"
          >
            Compare commercial shape before{' '}
            <span className="text-[#047857]">contracts</span>
          </motion.h2>

          <motion.p
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-base leading-relaxed text-[#6B7280] sm:text-lg"
          >
            Ops, finance, engineering, and risk evaluate the same workspace, then commercials follow coverage and
            rollout depth.
          </motion.p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <BentoCard delay={0.05}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#34D399]/15 text-[#059669]">
                <Shield className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111111]">Security review ready</h3>
              <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-[#6B7280]">
                Guided responses for Growth; dedicated review help on Enterprise, so procurement doesn&apos;t stall
                the operating decision.
              </p>
            </BentoCard>

            <BentoCard delay={0.15} className="flex-1">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#111111]">Plan comparison</h3>
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#6B7280]">
                Keep the commercial discussion clear before legal drafts arrive.
              </p>
              <div className="mt-6 overflow-hidden rounded-[1.25rem] border border-black/[0.05] bg-white">
                <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr_1fr] gap-2 border-b border-black/[0.05] bg-[#F7F8FA] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">
                  <span>Category</span>
                  <span>Sandbox</span>
                  <span>Growth</span>
                  <span>Enterprise</span>
                </div>
                {comparison.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[1.2fr_0.9fr_0.9fr_1fr] gap-2 border-b border-black/[0.04] px-3 py-3 text-[11px] last:border-0 sm:text-[12px]"
                  >
                    <span className="font-medium text-[#111111]">{row.label}</span>
                    <span className="text-[#6B7280]">{row.sandbox}</span>
                    <span className="text-[#6B7280]">{row.growth}</span>
                    <span className="text-[#6B7280]">{row.enterprise}</span>
                  </div>
                ))}
              </div>
            </BentoCard>
          </div>

          <div className="flex flex-col gap-4">
            <BentoCard delay={0.1}>
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#111111]">Shared buyer lenses</h3>
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#6B7280]">
                One commercial conversation across the teams that share payout accountability.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Marketplaces', 'NBFCs', 'PSPs', 'Treasury', 'Finance ops', 'Payout platforms'].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-black/8 bg-white px-3 py-1.5 text-[12px] font-medium text-[#374151]"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="mt-6 space-y-3">
                {[
                  { role: 'Operations', body: 'Queue connector drift and confirmation delays in one workspace.' },
                  { role: 'Finance', body: 'Evidence Packs ready for close, not screenshot hunts.' },
                  { role: 'Engineering', body: 'One shared payout record across providers and banks.' },
                ].map((item) => (
                  <div key={item.role} className="rounded-[1rem] border border-black/[0.05] bg-white px-4 py-3">
                    <p className="text-[13px] font-semibold text-[#111111]">{item.role}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#6B7280]">{item.body}</p>
                  </div>
                ))}
              </div>
            </BentoCard>

            <BentoCard delay={0.2}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#34D399] text-white">
                <BadgeCheck className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111111]">Account coverage that scales</h3>
              <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-[#6B7280]">
                From commercial review cadence on Growth to dedicated coverage on Enterprise, when multi-team rollout
                and regulated partners need a human spine.
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#34D399]/25 bg-[#E8F8F5] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#059669]">
                <Users className="h-3.5 w-3.5" />
                Ops · Finance · Eng · Risk
              </div>
            </BentoCard>
          </div>
        </div>
      </div>
    </section>
  )
}
