'use client'

import { Check } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

import { landingPricingCopy } from '@/components/landing-final/copy/landingPagesCopy'

const plans = landingPricingCopy.plans

export function PricingPlansSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section id="pricing-plans" className="scroll-mt-28 px-5 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9CA3AF]"
          >
            Rollout paths
          </motion.p>
          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-4 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.05em] text-[#111111] sm:text-4xl"
          >
            Sandbox first, then{' '}
            <span className="text-[#047857]">commercials with sales.</span>
          </motion.h2>
          <motion.p
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-[15px] leading-relaxed text-[#6B7280] sm:text-base"
          >
            Three enterprise-ready paths. No public rate card — pricing follows workspace depth and rollout needs.
          </motion.p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const featured = 'featured' in plan && plan.featured
            return (
              <motion.article
                key={plan.title}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className={`flex flex-col rounded-[1.75rem] border p-6 sm:p-7 ${
                  featured
                    ? 'border-[#34D399]/35 bg-[#F0FDF9] shadow-[0_24px_60px_rgba(5,150,105,0.12)]'
                    : 'border-black/[0.06] bg-[#F7F8FA]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                      {plan.subtitle}
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#111111]">{plan.title}</h3>
                  </div>
                  {featured ? (
                    <span className="shrink-0 rounded-full bg-[#047857] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                      Recommended
                    </span>
                  ) : null}
                </div>

                <p className="mt-5 text-[1.65rem] font-semibold tracking-[-0.04em] text-[#047857]">{plan.metric}</p>
                <p className="mt-3 text-[14px] leading-relaxed text-[#6B7280]">{plan.detail}</p>

                <ul className="mt-6 flex-1 space-y-3">
                  {plan.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-[14px] text-[#374151]">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E8F8F5] text-[#059669]">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>

                <a
                  href={
                    plan.title === 'Sandbox'
                      ? '/signin'
                      : 'mailto:Support@zordnet.com?subject=ZORD%20pricing%20discussion'
                  }
                  className={`mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-full px-5 py-3.5 text-[14px] font-semibold transition ${
                    featured
                      ? 'bg-[#111111] text-white hover:bg-black/90'
                      : 'border border-black/10 bg-white text-[#111111] hover:bg-black/[0.02]'
                  }`}
                >
                  {plan.title === 'Sandbox' ? 'Start in sandbox' : 'Talk to sales'}
                </a>
              </motion.article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
