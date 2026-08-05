'use client'

import { ZordMark } from '@/components/ZordMark'

interface ZordLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  className?: string
  /** `dark` = white mark on dark backgrounds; `light` = black mark on light backgrounds */
  variant?: 'light' | 'dark'
  /** Max nav height (h-11); mark scales to bar height. */
  fitToHeight?: boolean
  /** Inside a dark chrome bar — skip extra logo capsule. */
  embedded?: boolean
}

const MARK_HEIGHT: Record<NonNullable<ZordLogoProps['size']>, string> = {
  sm: 'h-8',
  md: 'h-10',
  lg: 'h-12',
  hero: 'h-16',
}

export function ZordLogo({
  size = 'md',
  className = '',
  variant = 'dark',
  fitToHeight,
  embedded: _embedded = false,
}: ZordLogoProps) {
  const onDarkBackground = variant === 'dark'

  return (
    <div className={`flex shrink-0 items-center justify-start ${className}`} aria-label="Zord">
      <ZordMark
        className={`block w-auto shrink-0 ${
          fitToHeight ? 'h-11 sm:h-[2.8rem]' : MARK_HEIGHT[size]
        } ${onDarkBackground ? 'text-white' : 'text-[#0A0A0A]'}`}
      />
    </div>
  )
}
