'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Compass, Layers, ShieldCheck } from 'lucide-react'
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

const resourceLinks = [
  { label: 'How it works', href: '/final-landing/how-it-works', detail: 'Operating model walkthrough' },
  { label: 'Security', href: '/#security', detail: 'Controls and finance-ready evidence' },
  { label: 'Pricing', href: '/final-landing/pricing', detail: 'Rollout paths and commercials' },
  { label: 'Contact', href: 'mailto:Support@zordnet.com?subject=ZORD%20resources%20request', detail: 'Demos and implementation support' },
] as const

export function ResourcesInstitutionalSection() {
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
              <Compass className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <span>Built for cross-functional evaluation</span>
          </motion.div>

          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-6 text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.055em] text-[#111111] sm:text-5xl"
          >
            One resource layer for{' '}
            <span className="text-[#047857]">every stakeholder.</span>
          </motion.h2>

          <motion.p
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-base leading-relaxed text-[#6B7280] sm:text-lg"
          >
            Operators, finance, engineering, and risk can start from the same model, then branch into the depth
            each team needs.
          </motion.p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <BentoCard delay={0.05}>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#34D399]/15 text-[#059669]">
                <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111111]">Trust before rollout</h3>
              <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-[#6B7280]">
                Security and proof resources help procurement and risk teams evaluate ZORD without slowing the
                operating decision.
              </p>
            </BentoCard>

            <BentoCard delay={0.15} className="flex-1">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[#111111]">Quick reference</h3>
              <p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#6B7280]">
                Jump to the resource that matches your current evaluation stage.
              </p>
              <div className="mt-6 overflow-hidden rounded-[1.25rem] border border-black/[0.05] bg-white">
                {resourceLinks.map((link, index) => {
                  const isMailto = link.href.startsWith('mailto:')
                  const Row = isMailto ? 'a' : Link
                  const rowProps = isMailto ? { href: link.href } : { href: link.href }

                  return (
                    <Row
                      key={link.label}
                      {...rowProps}
                      className={`group flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition-colors duration-150 hover:bg-[#F9FAFB] ${
                        index > 0 ? 'border-t border-black/[0.05]' : ''
                      }`}
                    >
                      <div>
                        <p className="text-[14px] font-semibold text-[#111111]">{link.label}</p>
                        <p className="mt-0.5 text-[12px] text-[#9CA3AF]">{link.detail}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-[#9CA3AF] transition group-hover:text-[#047857]" />
                    </Row>
                  )
                })}
              </div>
            </BentoCard>
          </div>

          <BentoCard delay={0.1} className="flex flex-col justify-between bg-[#F0FDF9] border-[#34D399]/20">
            <div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#34D399]/20 text-[#059669]">
                <Layers className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111111]">
                From understanding to adoption
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-[#6B7280]">
                The resource layer is designed for qualification, not self-serve deep dives. When teams are ready,
                Arealis walks through rollout, integration, and commercial fit on a demo call.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                ['Operators', 'Posture + queues'],
                ['Finance', 'Finality + proof'],
                ['Engineering', 'System model'],
              ].map(([role, focus]) => (
                <div
                  key={role}
                  className="rounded-[1.15rem] border border-[#34D399]/15 bg-white/70 px-3 py-4 text-center"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{role}</p>
                  <p className="mt-2 text-[13px] font-semibold leading-snug text-[#111111]">{focus}</p>
                </div>
              ))}
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  )
}
