'use client'

import { LandingHeroTopBar } from '@/components/landing-final/LandingHeroTopBar'
import { LandingSiteFooter } from '@/components/landing-final/LandingSiteFooter'

export function SolutionsSiteNav({
  scrollMorphTone = 'dark',
}: {
  scrollMorphTone?: 'dark' | 'light'
}) {
  return <LandingHeroTopBar scrollMorph scrollMorphTone={scrollMorphTone} />
}

export function SolutionsSiteFooter({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  return <LandingSiteFooter theme={theme} />
}
