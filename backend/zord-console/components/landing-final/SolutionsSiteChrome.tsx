'use client'

import { LandingHeroTopBar } from '@/components/landing-final/LandingHeroTopBar'
import { LandingSiteFooter } from '@/components/landing-final/LandingSiteFooter'
import type { FinalLandingNavLabel } from '@/components/landing-final/FinalLandingNavbar'

export function SolutionsSiteNav({
  active: _active = 'Solutions',
  theme: _theme = 'light',
  overlay = false,
}: {
  active?: FinalLandingNavLabel
  theme?: 'light' | 'dark'
  overlay?: boolean
}) {
  return <LandingHeroTopBar overlay={overlay} />
}

export function SolutionsSiteFooter({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  return <LandingSiteFooter theme={theme} />
}
