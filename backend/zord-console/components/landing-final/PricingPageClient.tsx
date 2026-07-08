'use client'

import { useEffect, useRef, useState } from 'react'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { PricingCatalog } from '@/components/landing-final/PricingCatalog'
import { PricingInfoSection } from '@/components/landing-final/PricingInfoSection'
import { PricingVideoHero } from '@/components/landing-final/PricingVideoHero'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'

export default function PricingPageClient() {
  const infoSectionRef = useRef<HTMLDivElement>(null)
  const [navOverlay, setNavOverlay] = useState(true)

  useEffect(() => {
    const target = infoSectionRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setNavOverlay(!entry.isIntersecting)
      },
      { rootMargin: '-80px 0px 0px 0px', threshold: 0 }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#1A1A1A]">
      <SolutionsSiteNav active="Pricing" overlay={navOverlay} />
      <FinalLandingAssistantButton />

      <PricingVideoHero />

      <div ref={infoSectionRef}>
        <PricingInfoSection />
      </div>

      <main className="relative z-10 pb-24 pt-12">
        <PricingCatalog />
      </main>

      <SolutionsSiteFooter />
    </div>
  )
}
