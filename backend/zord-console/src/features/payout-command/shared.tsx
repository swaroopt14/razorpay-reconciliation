'use client'

import { useEffect, useState, type RefObject, type ReactNode } from 'react'
import type { GlyphName } from '@/services/payout-command/model'

export function Glyph({ name, className = '' }: { name: GlyphName; className?: string }) {
  const base = `inline-block ${className}`

  switch (name) {
    case 'home':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M4 8.6 10 3.8l6 4.8v7.1H4V8.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8.2 15.7v-4.6h3.6v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'arrow-up-right':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M6 14 14 6M8 6h6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'document':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M6 3.8h5.8L15 7v9.2A1.8 1.8 0 0 1 13.2 18H6.8A1.8 1.8 0 0 1 5 16.2V5.6A1.8 1.8 0 0 1 6.8 3.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M11.8 3.8V7H15M7.8 10.2h4.8M7.8 13h4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'menu-dots':
      return <svg className={base} viewBox="0 0 20 20" fill="currentColor"><circle cx="5" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="15" cy="10" r="1.6" /></svg>
    case 'search':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="5.8" stroke="currentColor" strokeWidth="1.7" /><path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    case 'users':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M6.2 9.3a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM13.8 8.6a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" strokeWidth="1.5" /><path d="M2.8 15.8c.3-2.5 2.4-4.3 5.1-4.3s4.8 1.8 5.1 4.3M11.4 15.8c.2-1.9 1.8-3.2 3.9-3.2 1 0 2 .3 2.7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    case 'bank':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M3 7.2 10 3l7 4.2M4.5 8.5v6.8M8 8.5v6.8M12 8.5v6.8M15.5 8.5v6.8M2.5 16.5h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'folder':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M3.5 6.2A2.2 2.2 0 0 1 5.7 4h2l1.6 1.6h5a2.2 2.2 0 0 1 2.2 2.2v6.5a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V6.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
    case 'shield':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M10 2.5 4.5 4.8v4.5c0 4 2.3 6.3 5.5 8.2 3.2-1.9 5.5-4.2 5.5-8.2V4.8L10 2.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="m7.3 10.1 1.8 1.8 3.6-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'grid':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="12" y="3" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="3" y="12" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /><rect x="12" y="12" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" /></svg>
    case 'settlement':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M3.5 11.5 7 8l3 2.5 3.5-3 3 2.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.5 14.5h7M8 16.5h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="7" cy="8" r="1.1" fill="currentColor" />
          <circle cx="13" cy="10.5" r="1.1" fill="currentColor" />
        </svg>
      )
    case 'billing':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none" aria-hidden>
          <rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 8.5h14" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6.5 12h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'support':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M4 9.5a6 6 0 0 1 12 0v3.2c0 .9-.7 1.6-1.6 1.6h-.8l-1.4 2.2a.8.8 0 0 1-1.4-.6l1-1.6H6.4A1.6 1.6 0 0 1 4.8 12.7V9.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 16.2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'eye':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="10" cy="10" r="2.4" fill="currentColor" /></svg>
    case 'zap':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M10.7 2.8 5.8 10h3l-.5 7.2 5-7.3h-3l.4-7.1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'refresh':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M16 6.5V3.8l-2.6 2.3A6.2 6.2 0 1 0 16 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'chart':
      return <svg className={base} viewBox="0 0 20 20" fill="none"><path d="M4 14.5V9.5M10 14.5V5.5M16 14.5V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M3 16.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    case 'bell':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none">
          <path
            d="M10 2.5a4.2 4.2 0 0 0-4.2 4.2v2.1c0 .3-.1.7-.3 1l-.9 1.8h10.8l-.9-1.8a2 2 0 0 1-.3-1V6.7A4.2 4.2 0 0 0 10 2.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M7.2 14.5h5.6a1.8 1.8 0 0 1-5.6 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )
    case 'terminal':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none">
          <rect x="2.5" y="3.5" width="15" height="13" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 8.2 8.2 10 6 11.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.4 12.2h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'key':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none">
          <circle cx="6.8" cy="13.2" r="3.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="m9.1 11 7.4-7.4M13.7 6.4l1.7 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'copy':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none">
          <rect x="6" y="6" width="10" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 12.5V5.4A1.4 1.4 0 0 1 5.4 4h7.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'eye-off':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none">
          <path d="m3 3 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M8.4 5.6A8.5 8.5 0 0 1 10 5.5c5 0 8 5 8 5a13 13 0 0 1-2 2.5M6.2 7.6A12.7 12.7 0 0 0 2 10.5s3 5 8 5a8.7 8.7 0 0 0 3.5-.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8.4 9a2.4 2.4 0 0 0 3.1 3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    case 'check':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none">
          <path d="M4.5 10.5 8 14l7.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'lock':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none">
          <rect x="4" y="9" width="12" height="8.2" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6.6 9V6.6a3.4 3.4 0 0 1 6.8 0V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )
    default:
      return null
  }
}

export function ClientChart({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return <div className={`min-h-[8rem] min-w-0 ${className}`}>{mounted ? children : null}</div>
}

export function LightCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <article className={`rounded-[1.6rem] border border-black/10 bg-white p-5 shadow-[0_10px_24px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </article>
  )
}

export function SurfaceEyebrow({
  children,
  variant = 'default',
}: {
  children: ReactNode
  /** Stripe-style section eyebrow: 10px uppercase + letter-spacing */
  variant?: 'default' | 'stripe'
}) {
  if (variant === 'stripe') {
    return (
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">{children}</div>
    )
  }
  return <div className="pc-section-label">{children}</div>
}

type Rgba = {
  r: number
  g: number
  b: number
  a: number
}

function parseCssColor(color: string): Rgba | null {
  const normalized = color.trim().toLowerCase()
  if (!normalized || normalized === 'transparent') return null
  const match = normalized.match(/^rgba?\((.+)\)$/)
  if (!match) return null

  const tokens = match[1].split(',').map((token) => token.trim())
  if (tokens.length < 3) return null

  const r = Number.parseFloat(tokens[0])
  const g = Number.parseFloat(tokens[1])
  const b = Number.parseFloat(tokens[2])
  const a = tokens.length >= 4 ? Number.parseFloat(tokens[3]) : 1

  if ([r, g, b, a].some((value) => Number.isNaN(value))) return null
  return { r, g, b, a }
}

function toLinearChannel(value: number) {
  const sRgb = value / 255
  if (sRgb <= 0.04045) return sRgb / 12.92
  return ((sRgb + 0.055) / 1.055) ** 2.4
}

function relativeLuminance({ r, g, b }: Pick<Rgba, 'r' | 'g' | 'b'>) {
  return 0.2126 * toLinearChannel(r) + 0.7152 * toLinearChannel(g) + 0.0722 * toLinearChannel(b)
}

function resolveBackgroundColor(element: HTMLElement | null): Rgba {
  let node: HTMLElement | null = element
  while (node) {
    const parsed = parseCssColor(window.getComputedStyle(node).backgroundColor)
    if (parsed && parsed.a > 0.05) return parsed
    node = node.parentElement
  }
  return { r: 255, g: 255, b: 255, a: 1 }
}

export function usePromptAutoContrast(containerRef: RefObject<HTMLElement>) {
  const [isDarkBackground, setIsDarkBackground] = useState(false)

  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof window === 'undefined') return

    const compute = () => {
      const background = resolveBackgroundColor(node)
      setIsDarkBackground(relativeLuminance(background) < 0.43)
    }

    compute()

    const onResize = () => compute()
    window.addEventListener('resize', onResize)

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => compute())
      observer.observe(node)
      if (node.parentElement) observer.observe(node.parentElement)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      observer?.disconnect()
    }
  }, [containerRef])

  return {
    inputToneClass: isDarkBackground
      ? 'text-white/92 placeholder:text-white/50 caret-white'
      : 'text-[#111111] placeholder:text-[#8a8a86] caret-[#111111]',
    captionToneClass: isDarkBackground ? 'text-white/42' : 'text-[#8a8a86]',
  }
}

/**
 * Optional pill when a surface is backed by live APIs (`isLive`).
 * When not live, renders nothing (no placeholder / demo copy).
 *
 * `variant="command"` uses the same black “Live” styling as command-center surfaces.
 */
export function LiveDataHint({
  isLive,
  source,
  variant = 'default',
}: {
  isLive: boolean
  source?: string
  variant?: 'default' | 'command'
}) {
  if (!isLive) return null

  if (variant === 'command') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-black/30 bg-[#000000] px-2.5 py-1 text-[14px] font-semibold text-white">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
        Live{source ? ` · ${source}` : ''}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/30 bg-[#000000] px-2 py-0.5 text-[13px] font-medium text-white">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
      Live{source ? ` · ${source}` : ''}
    </span>
  )
}
