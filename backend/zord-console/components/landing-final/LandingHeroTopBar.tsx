'use client'

import Link from 'next/link'
import { ArrowRight, Globe, Menu, X } from 'lucide-react'
import { useState } from 'react'

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

export function LandingHeroTopBar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-black/[0.06] bg-[#fdfdfd]/92 backdrop-blur-md">
      <div className="mx-auto flex h-[4.25rem] max-w-[1440px] items-center gap-4 px-5 sm:h-[4.75rem] sm:px-8 lg:px-10">
        <Link
          href="/"
          className="shrink-0 transition-opacity duration-150 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-zord-blue-500 focus:ring-offset-2"
          aria-label="Zord home"
        >
          <ZordLogo
            size="sm"
            variant="light"
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
              className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0A0A0A] transition-colors duration-150 hover:text-[#4B5563] focus:outline-none focus:ring-2 focus:ring-zord-blue-500 focus:ring-offset-2"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:gap-5">
          <button
            type="button"
            className="hidden cursor-pointer items-center gap-2 text-[13px] font-medium text-[#6B7280] transition-colors duration-150 hover:text-[#0A0A0A] sm:flex"
            aria-label="Language: English"
          >
            <Globe className="h-4 w-4" strokeWidth={1.75} />
            <span>English</span>
          </button>

          <Link
            href="/signup"
            className="inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-[#0A0A0A] py-2 pl-2 pr-4 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-colors duration-150 hover:bg-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-zord-blue-500 focus:ring-offset-2 sm:pr-5"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0A0A0A]">
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <span className="hidden sm:inline">Launch app</span>
            <span className="sm:hidden">Launch</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-black/10 text-[#0A0A0A] transition-colors duration-150 hover:bg-black/[0.04] focus:outline-none focus:ring-2 focus:ring-zord-blue-500 lg:hidden"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-black/[0.06] bg-[#fdfdfd] px-5 py-4 lg:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile primary">
            {mobileLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="cursor-pointer rounded-lg px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#0A0A0A] transition-colors duration-150 hover:bg-black/[0.04]"
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
