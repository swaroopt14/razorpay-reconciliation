'use client'

import { BookMarked } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

import { resourceHighlights } from '@/components/landing-final/copy/resourcesCopy'

function ResourcesAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center"
        style={{ backgroundImage: "url('/final-landing/solutions/solutions-card-buyer-story-bg.png')" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_42%,rgba(16,185,129,0.28)_0%,transparent_62%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_38%,rgba(110,231,183,0.34)_0%,transparent_36%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_48%,rgba(52,211,153,0.3)_0%,transparent_38%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[46%] bg-[linear-gradient(180deg,transparent_0%,rgba(8,18,14,0.18)_38%,rgba(6,12,10,0.55)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_75%_at_50%_45%,transparent_42%,rgba(8,12,16,0.42)_100%)]" />
    </div>
  )
}

export function ResourcesValueSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="relative left-1/2 mt-16 w-screen -translate-x-1/2 overflow-hidden bg-[#0B1220] py-16 sm:py-20 lg:py-24">
      <ResourcesAtmosphere />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 md:px-8">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[2rem] border border-white/25 bg-white/[0.07] px-5 py-10 text-center shadow-[0_40px_100px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-[42px] sm:rounded-[2.25rem] sm:px-8 sm:py-12 md:px-12 md:py-14 lg:rounded-[2.5rem]"
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              background:
                'linear-gradient(160deg, rgba(255,255,255,0.22) 0%, transparent 28%, transparent 68%, rgba(52,211,153,0.08) 100%)',
            }}
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-xl">
            <div className="inline-flex items-center justify-center gap-2 text-[12px] font-medium tracking-[0.01em] text-white/85 sm:text-[13px]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[#6EE7B7] ring-1 ring-white/20 backdrop-blur-md sm:h-7 sm:w-7">
                <BookMarked className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} />
              </span>
              <span>What the resource layer is built for</span>
            </div>

            <h2 className="mt-5 text-[1.85rem] font-semibold leading-[1.05] tracking-[-0.055em] text-white sm:mt-6 sm:text-[2.5rem] md:text-[2.85rem]">
              One operating model across ops, finance, and engineering.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[14px] leading-relaxed text-white/70 sm:text-[15px]">
              Move from high-level understanding to rollout confidence — then go deeper into security, pricing, and
              implementation when your team is ready.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:gap-3.5">
              {resourceHighlights.map((item, index) => (
                <motion.div
                  key={item}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.45, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-[1.25rem] border border-white/20 bg-white/[0.1] px-5 py-4 text-left shadow-[0_18px_40px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-2xl sm:px-7 sm:py-5"
                >
                  <p className="text-[14px] font-medium leading-relaxed text-white/90 sm:text-[15px]">{item}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ['Buyer paths', '3'],
                ['Operating model', '1'],
                ['Support path', 'Demo'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1.15rem] border border-white/15 bg-white/[0.08] px-4 py-4 text-center backdrop-blur-xl"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">{label}</p>
                  <p className="mt-2 text-[15px] font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
