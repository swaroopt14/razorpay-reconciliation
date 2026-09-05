'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, Sparkles } from 'lucide-react'

import { LandingHeroDashboardPreview } from '@/components/landing-final/LandingHeroDashboardPreview'
import { LandingHeroRocks } from '@/components/landing-final/LandingHeroRocks'
import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'

const heroCopy = landingHomeCopy.hero.slides[0]
/** Home-only generated forest loop (greenery + mossy rocks) */
const HERO_VIDEO_SRC = '/final-landing/hero/hero-forest-loop.mp4'
const HERO_FALLBACK_BG = '/final-landing/sections/greenery-cta-bg.png'

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
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
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
      className="relative z-10 w-full overflow-hidden bg-[#0B1220] text-[#0A0A0A]"
      aria-labelledby="landing-hero-heading"
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        {!shouldReduceMotion ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={HERO_FALLBACK_BG}
            className="absolute inset-0 h-full w-full object-cover object-center scale-[1.03] [transform:translateZ(0)]"
          >
            <source src={HERO_VIDEO_SRC} type="video/mp4" />
          </video>
        ) : (
          <Image
            src={HERO_FALLBACK_BG}
            alt=""
            fill
            priority
            className="object-cover object-center scale-[1.02]"
            sizes="100vw"
          />
        )}
        {/* Transparent black scrim - video visible underneath, text stays readable */}
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/25 to-black/35" />
      </div>

      <motion.div
        className="relative z-10"
        variants={shouldReduceMotion ? undefined : containerVariants}
        initial={motionInitial}
        animate="visible"
      >
        <div className="relative mx-auto max-w-[920px] px-4 pb-8 pt-28 text-center sm:px-6 sm:pt-32 md:pt-36">
          <motion.p
            {...textItemMotion}
            className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/60"
          >
            {heroCopy.eyebrow}
          </motion.p>

          <motion.h1
            {...textItemMotion}
            id="landing-hero-heading"
            className="mx-auto mt-8 max-w-[16ch] text-[2.65rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:max-w-none sm:text-[3.4rem] lg:text-[4.25rem]"
          >
            <span className="block text-white">{heroCopy.headlineLead}</span>
            <span className="block text-white">{heroCopy.headlineTail}</span>
          </motion.h1>

          <motion.p
            {...textItemMotion}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/70 sm:text-lg"
          >
            {landingHomeCopy.featuresSection.subcopy}
          </motion.p>

          <motion.div
            {...textItemMotion}
            className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row sm:gap-4"
          >
            <Link
              href="/signin"
              className="inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 px-8 py-3.5 text-[15px] font-medium text-white backdrop-blur-md transition-colors duration-150 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#0B1220] sm:w-auto"
            >
              Launch
            </Link>
            <Link
              href="/signup"
              className="inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-white py-2 pl-2 pr-6 text-[15px] font-semibold text-[#111111] transition-colors duration-150 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0B1220] sm:w-auto"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111111] text-white">
                <ArrowUpRight className="h-[18px] w-[18px]" strokeWidth={2.25} />
              </span>
              Book Demo
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
