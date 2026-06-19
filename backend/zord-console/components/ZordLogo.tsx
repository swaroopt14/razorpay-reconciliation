'use client'

import Image from 'next/image'

const LOGO_SRC = '/images/logo-zord-tight-solid.png'

interface ZordLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero'
  className?: string
  variant?: 'light' | 'dark'
  /** Max nav height (h-11); full wordmark visible, left-aligned. */
  fitToHeight?: boolean
  /** Inside a dark chrome bar — skip the extra logo capsule. */
  embedded?: boolean
}

const SIZE_PX: Record<NonNullable<ZordLogoProps['size']>, { w: number; h: number }> = {
  sm: { w: 120, h: 36 },
  md: { w: 148, h: 44 },
  lg: { w: 180, h: 52 },
  hero: { w: 220, h: 64 },
}

export function ZordLogo({
  size = 'md',
  className = '',
  variant = 'dark',
  fitToHeight,
  embedded = false,
}: ZordLogoProps) {
  const dims = fitToHeight ? { w: 212, h: 64 } : SIZE_PX[size]
  const onDark = variant === 'dark'

  return (
    <div className={`flex shrink-0 items-center justify-start ${className}`} aria-label="Zord">
      <span
        className={`inline-flex items-center justify-center overflow-hidden ${
          embedded
            ? 'bg-transparent px-0 py-0'
            : onDark
              ? 'rounded-xl bg-[#0f1419] px-2.5 py-1.5 ring-1 ring-white/10'
              : 'bg-transparent px-0.5 py-0.5'
        } ${fitToHeight ? 'h-11' : ''}`}
      >
        <Image
          src={LOGO_SRC}
          alt="Zord"
          width={dims.w}
          height={dims.h}
          className={`h-auto w-auto object-contain object-left ${
            fitToHeight ? 'max-h-11 w-auto sm:max-h-[2.8rem]' : 'max-h-full'
          } ${onDark ? 'brightness-0 invert' : ''}`}
          priority={size === 'sm' || fitToHeight}
        />
      </span>
    </div>
  )
}
