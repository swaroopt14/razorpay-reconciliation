'use client'

import { LandingHeroTopBar } from '@/components/landing-final/LandingHeroTopBar'
import { LandingSiteFooter } from '@/components/landing-final/LandingSiteFooter'
import type { FinalLandingNavLabel } from '@/components/landing-final/FinalLandingNavbar'

export function SolutionsSiteNav({
  active: _active = 'Solutions',
  theme: _theme = 'light',
  scrollMorphTone = 'dark',
}: {
  active?: FinalLandingNavLabel
  theme?: 'light' | 'dark'
  /** @deprecated Use scrollMorph via SolutionsSiteNav — overlay is no longer used */
  overlay?: boolean
  scrollMorphTone?: 'dark' | 'light'
}) {
  return <LandingHeroTopBar scrollMorph scrollMorphTone={scrollMorphTone} />
}

export function SolutionsSiteFooter({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  return <LandingSiteFooter theme={theme} />
}
