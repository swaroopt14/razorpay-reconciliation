'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Play, Sparkles } from 'lucide-react'

import { LandingHeroDashboardPreview } from '@/components/landing-final/LandingHeroDashboardPreview'
import { LandingHeroRocks } from '@/components/landing-final/LandingHeroRocks'
import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'

const heroCopy = landingHomeCopy.hero.slides[0]
const HERO_WATERFALL_SRC = '/final-landing/hero/hero-waterfall-bg-hq.mp4'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.32, delayChildren: 0.25 },
  },
} as const

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1] as const },
  },
} as const

const dashboardVariants = {
  hidden: { opacity: 0, y: 28, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 28,
      damping: 24,
      mass: 1.5,
    },
  },
} as const

const instantVisible = { opacity: 1, y: 0, scale: 1 }

export function LandingHeroSection() {
  const shouldReduceMotion = useReducedMotion()
  const waterfallVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = waterfallVideoRef.current
    if (!video) return
    if (shouldReduceMotion) {
      video.pause()
      return
    }
    void video.play().catch(() => undefined)
  }, [shouldReduceMotion])

  const motionInitial = shouldReduceMotion ? false : 'hidden'
  const textItemMotion = shouldReduceMotion
    ? { initial: instantVisible, animate: instantVisible }
    : { variants: itemVariants }
  const dashboardMotion = shouldReduceMotion
    ? { initial: instantVisible, animate: instantVisible }
    : { variants: dashboardVariants }

  return (
    <section
      className="relative z-10 w-full overflow-hidden bg-[#0B1210] text-[#0A0A0A]"
      aria-labelledby="landing-hero-heading"
    >
      {/* Full-hero back layer: waterfall video behind headline + rocks + dashboard */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        {!shouldReduceMotion ? (
          <video
            ref={waterfallVideoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover object-center brightness-[1.12] contrast-[1.06] saturate-[1.1] [transform:translateZ(0)]"
          >
            <source src={HERO_WATERFALL_SRC} type="video/mp4" />
          </video>
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(165deg,#0B1210_0%,#111827_48%,#0F172A_100%)]" />
        )}
        <div className="absolute inset-0 bg-black/14" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/28 via-black/14 to-black/40" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_50%_at_50%_8%,rgba(0,0,0,0.08)_0%,transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_72%,rgba(0,0,0,0.04)_0%,rgba(0,0,0,0.38)_100%)]" />
      </div>

      <motion.div
        className="relative z-10"
        variants={shouldReduceMotion ? undefined : containerVariants}
        initial={motionInitial}
        animate="visible"
      >
        <div className="relative mx-auto max-w-[1280px] px-4 pb-6 pt-28 text-center sm:px-6 sm:pt-32 md:pt-36">
          <motion.p
            {...textItemMotion}
            className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/55"
          >
            {heroCopy.eyebrow}
          </motion.p>

          <motion.h1
            {...textItemMotion}
            id="landing-hero-heading"
            className="mx-auto mt-6 max-w-[820px] text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.04em] sm:text-5xl md:text-6xl lg:text-[4.25rem]"
          >
            <span className="block text-white">{heroCopy.headlineLead}</span>
            <span className="mt-1 block text-white">{heroCopy.headlineTail}</span>
          </motion.h1>

          <motion.p
            {...textItemMotion}
            className="mx-auto mt-6 max-w-[560px] text-base leading-relaxed text-[#0A0A0A] sm:text-lg md:text-[1.125rem]"
          >
            {heroCopy.copy}
          </motion.p>

          <motion.div
            {...textItemMotion}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <a
              href="/signup"
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#0A0A0A] px-8 py-3.5 text-base font-semibold text-white shadow-[0_16px_40px_rgba(0,0,0,0.14)] transition-colors duration-150 hover:bg-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-zord-blue-500 sm:w-auto"
            >
              Book Demo
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/final-landing/how-it-works"
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-6 py-3.5 text-base font-semibold text-[#0A0A0A] transition-colors duration-150 hover:bg-[#f5f5f5] focus:outline-none focus:ring-2 focus:ring-zord-blue-500 sm:w-auto"
            >
              See how it works
              <Play className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>

        <motion.div
          {...dashboardMotion}
          className="hero-wrapper relative flex min-h-[52vh] w-full flex-col items-center justify-center overflow-hidden px-3 pb-8 sm:min-h-[56vh] sm:px-4 md:min-h-[62vh] lg:min-h-[68vh]"
        >
          <LandingHeroRocks />

          <div className="dashboard-card relative z-[5] w-full max-w-[1200px] shadow-[0_20px_40px_rgba(0,0,0,0.04)]">
            <LandingHeroDashboardPreview />
          </div>
        </motion.div>

        <motion.div
          {...textItemMotion}
          className="relative flex flex-col items-center gap-2 pb-10 pt-2"
        >
          <div className="flex items-center gap-2 text-[12px] font-medium tracking-wide text-white/50">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <span>Scroll to explore</span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}
