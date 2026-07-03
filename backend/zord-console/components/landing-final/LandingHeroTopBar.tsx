'use client'

import Link from 'next/link'
import { ArrowRight, User } from 'lucide-react'
import { useState } from 'react'
import Image from 'next/image'

import { ZordLogo } from '@/components/ZordLogo'

const primaryLinks = [
  { label: 'Products', href: '/#product' },
  { label: 'Coverage', href: '/final-landing/solutions' },
  { label: 'Developers', href: '/final-landing/pricing' },
  { label: 'Company', href: '/final-landing/resources' },
  { label: 'Demo', href: '/demo' },
] as const

const mobileLinks = [
  ...primaryLinks,
  { label: 'Sign in', href: '/signin' },
] as const

export function LandingHeroTopBar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1440px] items-center gap-4 px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="shrink-0 flex items-center gap-2"
          aria-label="Zord home"
        >
          <span className="font-extrabold text-2xl tracking-tighter text-[#111]">arealis</span>
        </Link>

        <nav
          className="hidden flex-1 items-center justify-center gap-8 lg:flex xl:gap-10"
          aria-label="Primary"
        >
          {primaryLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="cursor-pointer text-[15px] font-medium text-[#111111] transition-colors duration-150 hover:text-black/60 focus:outline-none"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <Link
            href="/signup"
            className="hidden sm:inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#DBF33C] px-6 py-2.5 text-[15px] font-medium text-[#111] transition-transform hover:scale-105 focus:outline-none"
          >
            Get started
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>

          {/* India Flag Icon Mock */}
          <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-black">
            <div className="w-5 h-5 rounded-full overflow-hidden relative">
               <div className="w-full h-1/3 bg-[#FF9933]" />
               <div className="w-full h-1/3 bg-white flex items-center justify-center">
                 <div className="w-1.5 h-1.5 rounded-full border border-blue-800" />
               </div>
               <div className="w-full h-1/3 bg-[#138808]" />
            </div>
          </div>

          {/* User Icon */}
          <Link
            href="/signin"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white hover:bg-gray-800 transition-colors"
          >
            <User className="h-5 w-5" />
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-black/10 text-[#0A0A0A] transition-colors duration-150 hover:bg-black/[0.04] lg:hidden"
            aria-expanded={mobileOpen}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-black/[0.06] bg-white px-5 py-4 lg:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile primary">
            {mobileLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="cursor-pointer rounded-lg px-3 py-2.5 text-[15px] font-medium text-[#111] transition-colors duration-150 hover:bg-black/[0.04]"
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
