'use client'

import Link from 'next/link'
import { ArrowRight, Globe, Menu, X } from 'lucide-react'
import { useEffect, useState, type RefObject } from 'react'

import { ZordLogo } from '@/components/ZordLogo'

const primaryLinks = [
  { label: 'Product', href: '/#product' },
  { label: 'Solutions', href: '/final-landing/solutions' },
  { label: 'Pricing', href: '/final-landing/pricing' },
  { label: 'Resources', href: '/final-landing/resources' },
] as const

const mobileLinks = [
  ...primaryLinks,
  { label: 'Customers', href: '/final-landing/customers' },
  { label: 'Company', href: '/final-landing/company' },
  { label: 'Sign in', href: '/signin' },
] as const

const GLASS_SCROLL_PX = 80
const SOLID_SCROLL_PX = 300

type NavPhase = 'transparent' | 'glass' | 'solid' | 'default'

type ScrollMorphTone = 'dark' | 'light'

function getScrollMorphPhase(scrollY: number, tone: ScrollMorphTone): NavPhase {
  if (tone === 'light') {
    if (scrollY < SOLID_SCROLL_PX) return 'glass'
    return 'solid'
  }
  if (scrollY < GLASS_SCROLL_PX) return 'transparent'
  if (scrollY < SOLID_SCROLL_PX) return 'glass'
  return 'solid'
}

const headerSurfaceByPhase: Record<NavPhase, string> = {
  transparent: 'border-b border-transparent bg-transparent',
  glass:
    'border-b border-white/55 bg-white/72 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl',
  solid: 'border-b border-black/[0.06] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)]',
  default: 'border-b border-black/[0.06] bg-[#fdfdfd]/92 backdrop-blur-md',
}

const mobileMenuSurfaceByPhase: Record<NavPhase, string> = {
  transparent: 'border-white/10 bg-black/80 backdrop-blur-md',
  glass: 'border-black/[0.06] bg-white/95 backdrop-blur-xl',
  solid: 'border-black/[0.06] bg-white',
  default: 'border-black/[0.06] bg-[#fdfdfd]',
}

export function LandingHeroTopBar({
  scrollMorph = false,
  scrollMorphTone = 'dark',
  scrollContainerRef,
}: {
  scrollMorph?: boolean
  scrollMorphTone?: ScrollMorphTone
  scrollContainerRef?: RefObject<HTMLElement | null>
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    if (!scrollMorph) return

    const container = scrollContainerRef?.current

    const onScroll = () => {
      setScrollY(container?.scrollTop ?? window.scrollY)
    }

    onScroll()
    const target: HTMLElement | Window = container ?? window
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => target.removeEventListener('scroll', onScroll)
  }, [scrollMorph, scrollContainerRef])

  const phase: NavPhase = scrollMorph ? getScrollMorphPhase(scrollY, scrollMorphTone) : 'default'

  const useLightChrome = phase === 'glass' || phase === 'solid' || phase === 'default'

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-out ${headerSurfaceByPhase[phase]}`}
    >
      <div className="mx-auto flex h-[4.25rem] max-w-[1440px] items-center gap-4 px-5 sm:h-[4.75rem] sm:px-8 lg:px-10">
        <Link
          href="/"
          className="shrink-0 transition-opacity duration-150 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-zord-blue-500 focus:ring-offset-2"
          aria-label="Zord home"
        >
          <ZordLogo
            size="sm"
            variant={useLightChrome ? 'light' : 'dark'}
            fitToHeight
            className="!w-auto max-w-[7.5rem] sm:max-w-[8.5rem]"
          />
        </Link>

        <nav
          className="hidden flex-1 items-center justify-center gap-8 lg:flex xl:gap-10"
          aria-label="Primary"
        >
          {primaryLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`cursor-pointer text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-zord-blue-500 focus:ring-offset-2 ${
                useLightChrome ? 'text-[#0A0A0A] hover:text-[#4B5563]' : 'text-white/90 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:gap-5">
          <button
            type="button"
            className={`hidden cursor-pointer items-center gap-2 text-[13px] font-medium transition-colors duration-300 sm:flex ${
              useLightChrome ? 'text-[#6B7280] hover:text-[#0A0A0A]' : 'text-white/70 hover:text-white'
            }`}
            aria-label="Language: English"
          >
            <Globe className="h-4 w-4" strokeWidth={1.75} />
            <span>English</span>
          </button>

          <Link
            href="/signin"
            className={`inline-flex cursor-pointer items-center gap-2.5 rounded-full py-2 pl-2 pr-4 text-[13px] font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-zord-blue-500 focus:ring-offset-2 sm:pr-5 ${
              useLightChrome
                ? 'bg-[#0A0A0A] text-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] hover:bg-[#1f1f1f]'
                : 'bg-white text-[#0A0A0A] shadow-[0_8px_24px_rgba(0,0,0,0.2)] hover:bg-white/92'
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-300 ${
                useLightChrome ? 'bg-white text-[#0A0A0A]' : 'bg-[#0A0A0A] text-white'
              }`}
            >
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <span className="hidden sm:inline">Launch app</span>
            <span className="sm:hidden">Launch</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-zord-blue-500 lg:hidden ${
              useLightChrome
                ? 'border-black/10 text-[#0A0A0A] hover:bg-black/[0.04]'
                : 'border-white/20 text-white hover:bg-white/10'
            }`}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className={`border-t px-5 py-4 transition-colors duration-300 lg:hidden ${mobileMenuSurfaceByPhase[phase]}`}>
          <nav className="flex flex-col gap-1" aria-label="Mobile primary">
            {mobileLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.14em] transition-colors duration-150 ${
                  useLightChrome ? 'text-[#0A0A0A] hover:bg-black/[0.04]' : 'text-white hover:bg-white/10'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  )
}
