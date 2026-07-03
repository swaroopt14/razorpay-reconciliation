'use client'

import { LandingBranchCardStage } from '@/components/landing-final/LandingBranchCardStage'
import { LandingSection } from '@/components/landing-final/landingSectionLayout'

export function LandingSignalStageSection() {
  return (
    <LandingSection
      className="overflow-hidden pb-24 pt-8 sm:pb-28 lg:pb-32"
      aria-label="Payout signal intelligence preview"
    >
      <LandingBranchCardStage />
    </LandingSection>
  )
}
