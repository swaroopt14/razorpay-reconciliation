'use client'

import { useEffect, useRef, useState } from 'react'

import { FinalLandingAssistantButton } from '@/components/landing-final/FinalLandingAssistantButton'
import { ResourcesCatalog } from '@/components/landing-final/ResourcesCatalog'
import { ResourcesInfoSection } from '@/components/landing-final/ResourcesInfoSection'
import { ResourcesVideoHero } from '@/components/landing-final/ResourcesVideoHero'
import { SolutionsSiteFooter, SolutionsSiteNav } from '@/components/landing-final/SolutionsSiteChrome'

export default function ResourcesPageClient() {
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
      <SolutionsSiteNav active="Resources" overlay={navOverlay} />
      <FinalLandingAssistantButton />

      <ResourcesVideoHero />

      <div ref={infoSectionRef}>
        <ResourcesInfoSection />
      </div>

      <main className="relative z-10 pb-24 pt-12">
        <ResourcesCatalog />
      </main>

      <SolutionsSiteFooter />
    </div>
  )
}
