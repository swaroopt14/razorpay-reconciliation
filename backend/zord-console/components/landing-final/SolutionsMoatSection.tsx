'use client'

import { Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'

const moatItems = [
  {
    title: 'Data moat',
    body: 'Connected financial data grows with every rail and institution — powering one normalized access layer operators trust.',
  },
  {
    title: 'Technology moat',
    body: 'Payout-native architecture with proof attached to every state transition — not stitched dashboards and exports.',
  },
  {
    title: 'Deployment moat',
    body: 'Real-world operator validation turns live volume into learning no synthetic demo or slide deck can match.',
  },
] as const

function MoatAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Base artwork */}
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center"
        style={{ backgroundImage: "url('/final-landing/solutions/solutions-card-buyer-story-bg.png')" }}
      />

      {/* Soft color lifts — bloom instead of a flat wash */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_42%,rgba(16,185,129,0.28)_0%,transparent_62%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_38%,rgba(110,231,183,0.34)_0%,transparent_36%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_48%,rgba(52,211,153,0.3)_0%,transparent_38%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_78%,rgba(6,78,59,0.35)_0%,transparent_55%)]" />

      {/* Particle-cloud impression */}
      <div className="absolute left-1/2 top-[40%] h-[min(70vw,520px)] w-[min(110vw,980px)] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute inset-[4%] rounded-[48%] bg-[radial-gradient(circle_at_42%_40%,rgba(167,243,208,0.55)_0%,rgba(52,211,153,0.28)_34%,transparent_70%)] blur-[28px]" />
        <div className="absolute inset-[16%] rounded-[42%] bg-[radial-gradient(circle_at_58%_58%,rgba(16,185,129,0.42)_0%,rgba(5,150,105,0.18)_40%,transparent_72%)] blur-[40px]" />
        <div className="absolute inset-[-4%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(236,253,245,0.22)_0%,transparent_62%)] blur-[56px]" />
      </div>

      {/* Floor reflection + vignette */}
      <div className="absolute inset-x-0 bottom-0 h-[46%] bg-[linear-gradient(180deg,transparent_0%,rgba(8,18,14,0.18)_38%,rgba(6,12,10,0.55)_100%)]" />
      <div
        className="absolute inset-x-[-8%] bottom-[-10%] h-[36%] opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 72% 60% at 50% 0%, rgba(52,211,153,0.5) 0%, rgba(16,185,129,0.18) 42%, transparent 74%)',
          transform: 'scaleY(-1)',
          filter: 'blur(30px)',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_75%_at_50%_45%,transparent_42%,rgba(8,12,16,0.42)_100%)]" />
    </div>
  )
}

export function SolutionsMoatSection() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className="relative left-1/2 mt-16 w-screen -translate-x-1/2 overflow-hidden bg-[#0B1220] py-16 sm:py-20 lg:py-24">
      <MoatAtmosphere />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 md:px-8">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[2rem] border border-white/25 bg-white/[0.07] px-5 py-10 text-center shadow-[0_40px_100px_rgba(0,0,0,0.35),0_8px_32px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(255,255,255,0.08)] backdrop-blur-[42px] sm:rounded-[2.25rem] sm:px-8 sm:py-12 md:px-12 md:py-14 lg:rounded-[2.5rem]"
        >
          {/* Prismatic edge + soft light wash */}
          <div
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              background:
                'linear-gradient(160deg, rgba(255,255,255,0.22) 0%, transparent 28%, transparent 68%, rgba(52,211,153,0.08) 100%)',
            }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent sm:inset-x-10"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent sm:inset-x-12"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-xl">
            <div className="inline-flex items-center justify-center gap-2 text-[12px] font-medium tracking-[0.01em] text-white/85 sm:text-[13px]">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[#6EE7B7] ring-1 ring-white/20 backdrop-blur-md sm:h-7 sm:w-7">
                <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={2.25} />
              </span>
              <span>The competitive moat</span>
            </div>

            <h2 className="mt-5 text-[1.85rem] font-semibold leading-[1.05] tracking-[-0.055em] text-white sm:mt-6 sm:text-[2.5rem] md:text-[2.85rem] lg:text-[3.1rem]">
              Why this advantage is sustainable
            </h2>

            <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:gap-3.5">
              {moatItems.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.45, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-[1.25rem] border border-white/20 bg-white/[0.1] px-5 py-4 text-center shadow-[0_18px_40px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-2xl transition-colors duration-200 hover:bg-white/[0.14] sm:rounded-[1.35rem] sm:px-7 sm:py-5"
                >
                  <h3 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-white sm:text-xl">
                    {item.title}
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-[1.55] text-white/70 sm:mt-2 sm:text-[14px] sm:leading-relaxed">
                    {item.body}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
