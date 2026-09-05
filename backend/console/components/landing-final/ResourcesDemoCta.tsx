'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

export function ResourcesDemoCta() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.section
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.55 }}
      className="mt-16 rounded-[2rem] border border-black/[0.06] bg-white px-6 py-12 text-center shadow-[0_20px_60px_rgba(0,0,0,0.04)] sm:px-10 sm:py-14"
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-[1.1rem] bg-[linear-gradient(135deg,#059669_0%,#34D399_55%,#6EE7B7_100%)] text-white shadow-[0_12px_32px_rgba(52,211,153,0.35)]">
          <Sparkles className="h-6 w-6" strokeWidth={2.25} />
        </span>

        <h2 className="mt-8 text-[2rem] font-semibold leading-[1.08] tracking-[-0.05em] text-[#111111] sm:text-[2.65rem]">
          Ready to go deeper
          <br />
          <span className="bg-[linear-gradient(90deg,#059669_0%,#34D399_50%,#10B981_100%)] bg-clip-text text-transparent">
            with the team?
          </span>
        </h2>

        <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#6B7280] sm:text-base">
          Book a demo to plan getting started, or reach out directly for product access and setup questions.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="mailto:Support@zordnet.com?subject=ZORD%20resources%20request"
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#111111] px-8 py-3.5 text-[14px] font-semibold text-white transition hover:bg-black/90 sm:w-auto"
          >
            Talk to the team
          </a>
          <Link
            href="/final-landing/how-it-works"
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-8 py-3.5 text-[14px] font-semibold text-[#111111] transition hover:bg-black/[0.02] sm:w-auto"
          >
            See how it works
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </motion.section>
  )
}
