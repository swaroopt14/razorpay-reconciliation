'use client'

import { BookOpen } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

export function ResourcesInfoSection() {
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
            <BookOpen className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <p>From high-level understanding to rollout confidence, without scattered documents.</p>
        </motion.div>

        <motion.h2
          initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.6, delay: 0.06 }}
          className="mt-10 text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.055em] text-[#111111] sm:text-5xl lg:text-[3.75rem]"
        >
          Everything teams need to
          <span className="mt-2 block">
            evaluate, learn, and{' '}
            <span className="text-[#047857]">roll out ZORD.</span>
          </span>
        </motion.h2>

        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55, delay: 0.12 }}
          className="mt-8 max-w-2xl text-base leading-relaxed text-[#6B7280] sm:text-lg sm:leading-8"
        >
          Use the resource layer to understand the operating model, security posture, commercial fit, and the
          fastest path to working with the Arealis team.
        </motion.p>
      </div>
    </section>
  )
}
