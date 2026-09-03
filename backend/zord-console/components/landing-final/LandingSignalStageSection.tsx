'use client'

import { LandingBranchCardStage } from '@/components/landing-final/LandingBranchCardStage'

export function LandingSignalStageSection() {
  return (
    // Full-bleed section: no shared shell padding so the branch reaches the edges.
    // The header re-applies its own padded shell inside LandingBranchCardStage.
    <section
      className="overflow-hidden pb-24 pt-8 sm:pb-28 lg:pb-32"
      aria-label="Payment health preview"
    >
      <LandingBranchCardStage />
    </section>
  )
}
