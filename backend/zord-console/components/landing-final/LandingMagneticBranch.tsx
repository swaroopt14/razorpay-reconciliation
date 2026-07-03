'use client'

import { LandingMagneticMoss } from '@/components/landing-final/LandingMagneticMoss'

type LandingMagneticBranchProps = {
  className?: string
  variant?: 'default' | 'hero'
  interactionEnabled?: boolean
}

export function LandingMagneticBranch({
  className = '',
  variant = 'default',
  interactionEnabled = true,
}: LandingMagneticBranchProps) {
  const heroClass =
    variant === 'hero'
      ? 'mx-auto w-full max-w-[min(96vw,1240px)] min-h-[min(38vh,300px)] sm:min-h-[min(42vh,360px)] md:min-h-[min(46vh,420px)]'
      : ''

  return (
    <LandingMagneticMoss
      drySrc="/final-landing/hero/branch-dry.png"
      mossSrc="/final-landing/hero/branch-moss.png"
      aspectRatio="654 / 381"
      radiusDesktop={variant === 'hero' ? 180 : 150}
      radiusTablet={variant === 'hero' ? 140 : 110}
      interactionEnabled={interactionEnabled}
      className={`${heroClass} ${className}`.trim()}
    />
  )
}
