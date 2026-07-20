'use client'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { PricingCatalog } from '@/components/landing-final/PricingCatalog'
import { PricingInfoSection } from '@/components/landing-final/PricingInfoSection'
import { PricingVideoHero } from '@/components/landing-final/PricingVideoHero'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'

export default function PricingPageClient() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#1A1A1A]">
      <SolutionsSiteNav />
      <FinalLandingAssistantButton />

      <PricingVideoHero />

      <div>
        <PricingInfoSection />
      </div>

      <main className="relative z-10 pb-24 pt-12">
        <PricingCatalog />
      </main>

      <SolutionsSiteFooter />
    </div>
  )
}
