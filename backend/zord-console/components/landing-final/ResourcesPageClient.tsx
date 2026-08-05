'use client'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { ResourcesCatalog } from '@/components/landing-final/ResourcesCatalog'
import { ResourcesInfoSection } from '@/components/landing-final/ResourcesInfoSection'
import { ResourcesVideoHero } from '@/components/landing-final/ResourcesVideoHero'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'

export default function ResourcesPageClient() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#1A1A1A]">
      <SolutionsSiteNav />
      <FinalLandingAssistantButton />

      <ResourcesVideoHero />

      <div>
        <ResourcesInfoSection />
      </div>

      <main className="relative z-10 pb-24 pt-12">
        <ResourcesCatalog />
      </main>

      <SolutionsSiteFooter />
    </div>
  )
}
