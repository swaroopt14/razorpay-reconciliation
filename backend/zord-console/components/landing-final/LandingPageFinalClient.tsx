'use client'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { LandingHeroSection } from '@/components/landing-final/LandingHeroSection'
import { LandingCapabilitiesSection } from '@/components/landing-final/LandingCapabilitiesSection'
import { LandingFinalCtaSection } from '@/components/landing-final/LandingFinalCtaSection'
import { LandingHowItWorksSection } from '@/components/landing-final/LandingHowItWorksSection'
import { LandingHeroTopBar } from '@/components/landing-final/LandingHeroTopBar'
import { LandingProductFooter } from '@/components/landing-final/LandingProductFooter'
import { LandingScrollRevealSection } from '@/components/landing-final/LandingScrollRevealSection'
import { LandingSignalStageSection } from '@/components/landing-final/LandingSignalStageSection'
import { LIGHT_PRODUCT_SECTION } from '@/components/landing-final/landingSectionLayout'

export default function LandingPageFinalClient() {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden text-slate-50 selection:bg-blue-500/30 selection:text-white"
      style={{
        background: 'linear-gradient(180deg, var(--color-brand-base) 0%, var(--color-brand-surface) 100%)',
        fontFamily: '"Sora", "Plus Jakarta Sans", "DM Sans", "Inter", system-ui, sans-serif',
      }}
    >
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, var(--color-brand-base) 0%, var(--color-brand-surface) 100%)' }} />
        <div className="absolute inset-x-0 top-0 h-[72rem]" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-brand-surface-hover) 94%, white 6%) 0%, rgba(18,23,31,0.95) 16%, rgba(12,14,18,0.78) 38%, rgba(10,10,12,0) 100%)' }} />
        <div className="absolute inset-0 zord-grid-soft opacity-[0.16]" />
        <div className="absolute inset-0 bg-noise opacity-[0.18]" />
        <div className="absolute left-1/2 top-[-8%] h-[54rem] w-[72rem] -translate-x-1/2 rounded-full blur-[190px]" style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--color-brand-blue) 22%, transparent) 0%, rgba(30, 41, 59, 0.14) 32%, rgba(10,10,12,0) 74%)' }} />
        <div className="absolute left-1/2 top-[22%] h-[32rem] w-[42rem] -translate-x-1/2 rounded-full blur-[150px]" style={{ background: 'radial-gradient(circle, rgba(255, 255, 255, 0.06) 0%, color-mix(in srgb, var(--color-brand-blue) 10%, transparent) 28%, rgba(10,10,12,0) 72%)' }} />
        <div className="absolute left-1/2 bottom-[-8%] h-[26rem] w-[46rem] -translate-x-1/2 rounded-full blur-[170px]" style={{ background: 'radial-gradient(circle, rgba(71,85,105,0.16) 0%, rgba(10,10,12,0) 70%)' }} />
        <div className="absolute inset-y-0 left-[10%] hidden w-px bg-gradient-to-b from-transparent via-white/8 to-transparent lg:block" />
        <div className="absolute inset-y-0 right-[10%] hidden w-px bg-gradient-to-b from-transparent via-white/8 to-transparent lg:block" />
        <div className="absolute left-0 top-[24%] h-px w-[120%] origin-left -rotate-[8deg] bg-gradient-to-r from-transparent via-white/8 to-transparent" />
        <div className="absolute left-0 top-[58%] h-px w-[120%] origin-left -rotate-[8deg] bg-gradient-to-r from-transparent via-white/7 to-transparent" />
      </div>

      <div className="relative z-10">
        <LandingHeroTopBar scrollMorph scrollMorphTone="dark" />
        <FinalLandingAssistantButton />
        <LandingHeroSection />
        <div className={LIGHT_PRODUCT_SECTION}>
          <LandingScrollRevealSection />
          <LandingSignalStageSection />
          <LandingHowItWorksSection />
          <LandingCapabilitiesSection />
          <LandingFinalCtaSection />
          <LandingProductFooter />
        </div>
      </div>
    </div>
  )
}
