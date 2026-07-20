'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

import { resourceCards } from '@/components/landing-final/copy/resourcesCopy'

export function ResourcesCardsSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section id="resources-catalog" className="scroll-mt-28 px-5 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9CA3AF]"
          >
            Resource map
          </motion.p>
          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-4 text-[2.2rem] font-semibold leading-[1.05] tracking-[-0.05em] text-[#111111] sm:text-4xl"
          >
            Start with the path that{' '}
            <span className="text-[#047857]">matches your question.</span>
          </motion.h2>
          <motion.p
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-4 text-[15px] leading-relaxed text-[#6B7280] sm:text-base"
          >
            Product walkthrough, security, pricing, and direct support, without bouncing between scattered documents.
          </motion.p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {resourceCards.map((item, index) => {
            const isExternal = item.href.startsWith('mailto:')
            const CardWrapper = isExternal ? 'a' : Link
            const wrapperProps = isExternal
              ? { href: item.href }
              : { href: item.href as '/final-landing/how-it-works' | '/final-landing/pricing' | '/#security' }

            return (
              <motion.div
                key={item.title}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
              >
                <CardWrapper
                  {...wrapperProps}
                  className={`group flex h-full cursor-pointer flex-col rounded-[1.75rem] border p-6 transition-colors duration-150 sm:p-7 ${
                    index === 0
                      ? 'border-[#34D399]/30 bg-[#F0FDF9] shadow-[0_20px_50px_rgba(5,150,105,0.1)] hover:border-[#34D399]/45'
                      : 'border-black/[0.06] bg-[#F7F8FA] hover:border-black/[0.1] hover:bg-[#F3F4F6]'
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
                    {item.eyebrow}
                  </p>
                  <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#111111] sm:text-[1.35rem] sm:leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-4 flex-1 text-[14px] leading-relaxed text-[#6B7280]">{item.body}</p>
                  <span className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-[#047857] transition group-hover:gap-2.5">
                    {item.cta}
                    <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                </CardWrapper>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
