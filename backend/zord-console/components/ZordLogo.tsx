'use client'

import { ZordMark } from '@/components/ZordMark'

interface ZordLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  className?: string
  /** `dark` = light wordmark on dark backgrounds; `light` = dark wordmark on light backgrounds */
  variant?: 'light' | 'dark'
  /** Max nav height; mark scales to bar height. */
  fitToHeight?: boolean
  /** Inside a dark chrome bar - skip extra logo capsule. */
  embedded?: boolean
  /** Mark + upright ZORD wordmark (original Zord lockup - not an italic vendor clone). */
  withWordmark?: boolean
}

const MARK_HEIGHT: Record<NonNullable<ZordLogoProps['size']>, string> = {
  sm: 'h-6',
  md: 'h-7',
  lg: 'h-8',
  hero: 'h-11',
}

const TILE_SIZE: Record<NonNullable<ZordLogoProps['size']>, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-12 w-12',
  hero: 'h-16 w-16',
}

const WORDMARK_SIZE: Record<NonNullable<ZordLogoProps['size']>, string> = {
  sm: 'text-[16px]',
  md: 'text-[18px]',
  lg: 'text-[20px]',
  hero: 'text-[26px]',
}

export function ZordLogo({
  size = 'md',
  className = '',
  variant = 'dark',
  fitToHeight,
  embedded: _embedded = false,
  withWordmark = false,
}: ZordLogoProps) {
  const onDarkBackground = variant === 'dark'
  const markClass = fitToHeight ? 'h-5' : MARK_HEIGHT[size]

  if (!withWordmark) {
    return (
      <div className={`flex shrink-0 items-center justify-start ${className}`} aria-label="Zord">
        <ZordMark
          className={`block w-auto shrink-0 ${
            fitToHeight ? 'h-8 sm:h-9' : MARK_HEIGHT[size === 'sm' ? 'md' : size]
          } ${onDarkBackground ? 'text-white' : 'text-[#0A0A0A]'}`}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-start gap-3.5 sm:gap-4 ${className}`}
      aria-label="Zord"
    >
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-none bg-black ${TILE_SIZE[size]}`}
        aria-hidden
      >
        <ZordMark className={`block w-auto text-white ${markClass}`} />
      </span>
      <span
        className={`select-none font-semibold uppercase tracking-[0.2em] ${WORDMARK_SIZE[size]} ${
          onDarkBackground ? 'text-white' : 'text-[#0F172A]'
        }`}
      >
        Zord
      </span>
    </div>
  )
}
