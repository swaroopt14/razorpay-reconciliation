'use client'

import { motion, useInView, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { LandingMagneticBranch } from '@/components/landing-final/LandingMagneticBranch'
import { LANDING_SECTION_SHELL, LandingSectionHeader } from '@/components/landing-final/landingSectionLayout'
import { RiskIntelligenceCard, SignalFloatingOverlays } from '@/components/landing-final/landingSignalStageUi'
import TiltedCard from '@/components/landing-final/TiltedCard'

const STAGE_EASE = [0.22, 1, 0.36, 1] as const

/** Branch + card fade, tilt starts after reveal completes. */
const CARD_REVEAL_MS = 2200
const ASSETS_DELAY_MS = 450

function RiskIntelligenceStageCard({ animate }: { animate: boolean }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        className="pointer-events-none absolute -inset-6 rounded-[2.75rem] bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,255,255,0.14),transparent_68%)]"
        aria-hidden
      />
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
        animate={shouldReduceMotion || animate ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 1.1, ease: STAGE_EASE }}
      >
        <RiskIntelligenceCard animate={animate} />
      </motion.div>
    </div>
  )
}

/** Branch with the live Risk Intelligence card resting on top, magnetic moss on the branch. */
export function LandingBranchCardStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const inView = useInView(stageRef, { once: true, amount: 0.1 })
  const shouldReduceMotion = useReducedMotion()
  const [assetsVisible, setAssetsVisible] = useState(false)
  const [signalAnimate, setSignalAnimate] = useState(false)
  const [tiltReady, setTiltReady] = useState(false)

  useEffect(() => {
    if (!inView) return
    if (shouldReduceMotion) {
      setAssetsVisible(true)
      setSignalAnimate(true)
      setTiltReady(true)
      return
    }

    const assetsTimer = setTimeout(() => setAssetsVisible(true), ASSETS_DELAY_MS)
    const signalTimer = setTimeout(() => setSignalAnimate(true), ASSETS_DELAY_MS + 300)
    const tiltTimer = setTimeout(() => setTiltReady(true), CARD_REVEAL_MS)

    return () => {
      clearTimeout(assetsTimer)
      clearTimeout(signalTimer)
      clearTimeout(tiltTimer)
    }
  }, [inView, shouldReduceMotion])

  return (
    <div ref={stageRef} className="relative w-full">
      {/* Header keeps the shared padded shell; the branch stage below is full-bleed. */}
      <div className={LANDING_SECTION_SHELL}>
        <LandingSectionHeader
          badge="PAYMENT LIFECYCLE INTELLIGENCE"
          title="Signals surface before"
          titleAccent="money leaks"
          description="Zord compares each downstream event with the authorised payment contract and surfaces material differences before they become difficult to recover."
          animated
          inView={inView}
        />
      </div>

      <div className="relative mx-auto mt-16 w-full min-h-[min(72vh,680px)] sm:min-h-[min(76vh,720px)]">
        <motion.div
          className="absolute inset-x-0 bottom-0 z-10"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 56 }}
          animate={assetsVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 56 }}
          transition={{ duration: 1.45, ease: STAGE_EASE }}
        >
          <LandingMagneticBranch
            variant="hero"
            interactionEnabled
            className="drop-shadow-[0_24px_56px_rgba(0,0,0,0.09)]"
          />
        </motion.div>

        <motion.div
          className="absolute left-1/2 top-[4%] z-30 w-full max-w-[440px] -translate-x-1/2 overflow-visible px-3 sm:top-[2%] sm:max-w-[480px]"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 64 }}
          animate={assetsVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 64 }}
          transition={{ duration: 1.55, ease: STAGE_EASE, delay: shouldReduceMotion ? 0 : 0.28 }}
        >
          <div className="relative overflow-visible">
            {tiltReady ? (
              <div
                className="pointer-events-none absolute -inset-3 z-40 overflow-hidden rounded-[2rem] opacity-[0.55]"
                aria-hidden
              >
                <div className="absolute inset-0 animate-[cinematic-shimmer_4.8s_ease-in-out_infinite] bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,0.22)_50%,transparent_62%)]" />
              </div>
            ) : null}
            <TiltedCard
              containerWidth="100%"
              containerHeight="auto"
              rotateAmplitude={12}
              scaleOnHover={1.04}
              showMobileWarning={false}
              showTooltip={false}
              enabled={tiltReady && !shouldReduceMotion}
            >
              <RiskIntelligenceStageCard animate={signalAnimate} />
            </TiltedCard>
            {assetsVisible ? <SignalFloatingOverlays /> : null}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
