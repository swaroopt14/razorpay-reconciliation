'use client'

import Link from 'next/link'
import { ArrowDown, Play } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

const VIDEO_SRC = '/final-landing/solutions/solutions-rainforest-hero.mp4'

export function SolutionsVideoHero() {
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

  return (
    <section className="relative min-h-[100svh] w-full overflow-hidden bg-[#07140f]">
      {!shouldReduceMotion ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
          aria-hidden="true"
        >
          <source src={VIDEO_SRC} type="video/mp4" />
        </video>
      ) : (
        <div
          className="absolute inset-0 bg-[linear-gradient(135deg,#0a1f14_0%,#123524_45%,#07140f_100%)]"
          aria-hidden="true"
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(52,211,153,0.12),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-black/20 to-black/75" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-black/25" />

      <div className="relative z-10 flex min-h-[100svh] flex-col justify-end px-5 pb-10 pt-28 sm:px-8 sm:pb-14 lg:px-10">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-3xl"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
              ZORD Solutions
            </p>
            <h1 className="mt-5 text-[2.6rem] font-semibold leading-[0.95] tracking-[-0.06em] text-white sm:text-6xl lg:text-[5.5rem]">
              Financial infrastructure
              <span className="block text-white">rooted in nature.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white sm:text-lg">
              Every payout, identity, and data workflow your team needs, scan the catalog below, book a demo for rollout depth.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="mailto:Support@zordnet.com?subject=Explore%20Zord%20solutions"
                className="inline-flex cursor-pointer items-center justify-center rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-[#0A0A0A] transition hover:bg-white/92"
              >
                Contact sales
              </a>
              <Link
                href="/"
                className="inline-flex cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 px-7 py-3.5 text-[14px] font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
              >
                Back to home
              </Link>
            </div>
          </motion.div>

          <motion.a
            href="#solutions-catalog"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="group inline-flex w-full max-w-sm cursor-pointer items-center justify-between gap-4 rounded-[1.35rem] border border-white/20 bg-white/10 px-5 py-4 text-white backdrop-blur-md transition hover:bg-white/15 lg:w-auto"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">Explore catalog</p>
              <p className="mt-1 truncate text-[15px] font-semibold tracking-[-0.02em]">Scroll to all solutions</p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#0A0A0A] transition group-hover:scale-105">
              <ArrowDown className="h-4 w-4" />
            </span>
          </motion.a>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/45 sm:flex">
        <Play className="h-3 w-3" />
        <span>Scroll to explore</span>
      </div>
    </section>
  )
}
