'use client'

import { useEffect, useRef, useState } from 'react'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { SolutionsCapabilityCatalog } from '@/components/landing-final/SolutionsCapabilityCatalog'
import { SolutionsInfoSection } from '@/components/landing-final/SolutionsInfoSection'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'
import { SolutionsVideoHero } from '@/components/landing-final/SolutionsVideoHero'

export default function SolutionsHubClient() {
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
      <SolutionsSiteNav active="Solutions" overlay={navOverlay} />
      <FinalLandingAssistantButton />

      <SolutionsVideoHero />

      <div ref={infoSectionRef}>
        <SolutionsInfoSection />
      </div>

      <main className="relative z-10 pb-24 pt-12">
        <SolutionsCapabilityCatalog />
      </main>

      <SolutionsSiteFooter />
    </div>
  )
}
