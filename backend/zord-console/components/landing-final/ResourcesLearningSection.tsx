'use client'

import { Users } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

import { learningPaths } from '@/components/landing-final/copy/resourcesCopy'

export function ResourcesLearningSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="mt-16 px-5 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[2rem] border border-black/[0.06] bg-[#F7F8FA] p-6 sm:p-8 lg:p-10">
          <div className="mx-auto max-w-2xl text-center">
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 text-[13px] font-medium text-[#111111]"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#34D399]/15 text-[#059669]">
                <Users className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
              <span>Learning paths</span>
            </motion.div>

            <motion.h2
              initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.55, delay: 0.05 }}
              className="mt-6 text-[2rem] font-semibold leading-[1.05] tracking-[-0.05em] text-[#111111] sm:text-3xl"
            >
              Start from the buyer lens your team{' '}
              <span className="text-[#047857]">actually has.</span>
            </motion.h2>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {learningPaths.map((path, index) => (
              <motion.article
                key={path.title}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="rounded-[1.5rem] border border-black/[0.05] bg-white p-6"
              >
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#111111]">{path.title}</h3>
                <p className="mt-4 text-[14px] leading-relaxed text-[#6B7280]">{path.body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
