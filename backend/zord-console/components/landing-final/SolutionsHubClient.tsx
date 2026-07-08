'use client'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { SolutionsCapabilityCatalog } from '@/components/landing-final/SolutionsCapabilityCatalog'
import { SolutionsInfoSection } from '@/components/landing-final/SolutionsInfoSection'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'
import { SolutionsVideoHero } from '@/components/landing-final/SolutionsVideoHero'

export default function SolutionsHubClient() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#1A1A1A]">
      <SolutionsSiteNav active="Solutions" />
      <FinalLandingAssistantButton />

      <SolutionsVideoHero />

      <div>
        <SolutionsInfoSection />
      </div>

      <main className="relative z-10 pb-24 pt-12">
        <SolutionsCapabilityCatalog />
      </main>

      <SolutionsSiteFooter />
    </div>
  )
}
