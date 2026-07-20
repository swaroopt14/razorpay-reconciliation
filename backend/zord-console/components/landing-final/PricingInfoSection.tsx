'use client'

import { Layers } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

export function PricingInfoSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="bg-white px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.55 }}
          className="flex max-w-2xl items-center justify-center gap-2.5 text-[13px] leading-relaxed text-[#111111] sm:text-[14px]"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#34D399]/15 text-[#059669]">
            <Layers className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <p>Enterprise commercials for payout intelligence, not payments, payroll, or banking SKUs.</p>
        </motion.div>

        <motion.h2
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.6, delay: 0.06 }}
          className="mt-10 text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.055em] text-[#111111] sm:text-5xl lg:text-[3.75rem]"
        >
          Price the operating layer.
          <span className="mt-2 block">
            Not a{' '}
            <span className="text-[#047857]">checkout rate card.</span>
          </span>
        </motion.h2>

        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55, delay: 0.12 }}
          className="mt-8 max-w-2xl text-base leading-relaxed text-[#6B7280] sm:text-lg sm:leading-8"
        >
          Commercials follow workspace depth, connector coverage, Evidence Pack workflows, and rollout support,
          shaped after your team validates fit in sandbox.
        </motion.p>
      </div>
    </section>
  )
}
