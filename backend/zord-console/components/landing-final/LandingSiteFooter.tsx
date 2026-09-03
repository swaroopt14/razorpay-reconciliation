'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowUp } from 'lucide-react'

import { ZordLogo } from '@/components/ZordLogo'

const FOOTER_ASSETS = {
  organic: '/final-landing/footer/footer-cta-organic.png',
  helix: '/final-landing/footer/footer-badge-helix.png',
  neural: '/final-landing/footer/footer-badge-neural.png',
} as const

const footerColumns = [
  {
    title: 'Company',
    links: [
      { label: 'About Arealis', href: '/final-landing/company' },
      { label: 'How it works', href: '/final-landing/how-it-works' },
      { label: 'Resources', href: '/final-landing/resources' },
      { label: 'Contact', href: 'mailto:Support@zordnet.com?subject=Talk%20to%20Zord' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'Solutions hub', href: '/final-landing/solutions' },
      { label: 'Pricing', href: '/final-landing/pricing' },
      { label: 'Console', href: '/signin' },
      { label: 'Book demo', href: '/signup' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { label: 'Large payout batches', href: '/final-landing/solutions/large-payout-batches' },
      { label: 'Marketplace settlements', href: '/final-landing/solutions/marketplace-settlements' },
      { label: 'Payroll', href: '/final-landing/solutions/payroll' },
      { label: 'Reconciliation', href: '/final-landing/solutions/enterprise-reconciliation' },
    ],
  },
  {
    title: 'Legal & compliance',
    links: [
      { label: 'Terms of service', href: '#' },
      { label: 'Privacy policy', href: '#' },
      { label: 'Security', href: '/#security' },
      { label: 'Compliance', href: '#' },
    ],
  },
] as const

const socialLinks = [
  { label: 'YouTube', href: 'https://youtube.com', icon: YoutubeIcon },
  { label: 'LinkedIn', href: 'https://linkedin.com', icon: LinkedinIcon },
  { label: 'X', href: 'https://x.com', icon: XIcon },
] as const

const sectionLabelClass = (isLight: boolean) =>
  `text-[10px] font-semibold uppercase tracking-[0.22em] ${
    isLight ? 'text-[#9CA3AF]' : 'text-white/45'
  }`

const glassCardClass =
  'overflow-hidden rounded-[1.15rem] border border-white/55 bg-white/30 shadow-[0_10px_40px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-2xl ring-1 ring-white/35'

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8ZM9.75 15.02V8.98L15.5 12l-5.75 3.02Z" />
    </svg>
  )
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.95v5.66H9.34V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.35-1.85 3.58 0 4.24 2.36 4.24 5.43v6.31ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

export function LandingSiteFooter({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const isLight = theme === 'light'

  return (
    <footer
      className={
        isLight
          ? 'bg-[linear-gradient(180deg,#F5F6F8_0%,#ECEFF3_100%)]'
          : 'bg-[linear-gradient(180deg,#070B10_0%,#030508_100%)]'
      }
    >
      {/* CTA band */}
      <section
        className={`px-5 pb-8 pt-10 sm:px-8 sm:pb-10 sm:pt-12 lg:px-10 lg:pb-12 lg:pt-14 ${
          isLight ? 'border-b border-black/[0.05]' : 'border-b border-white/[0.06]'
        }`}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[1fr_380px] lg:gap-12 xl:gap-14">
          <div className="lg:pr-4">
            <h2
              className={`max-w-[14ch] text-[2.6rem] font-bold leading-[0.96] tracking-[-0.065em] sm:text-[3.25rem] lg:text-[3.5rem] ${
                isLight ? 'text-[#0A0A0A]' : 'text-white'
              }`}
            >
              See your payouts clearly with ZORD
            </h2>
            <Link
              href="/signup"
              className={`mt-5 inline-flex cursor-pointer items-center justify-center rounded-full px-8 py-3.5 text-[14px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.18)] focus:outline-none focus:ring-2 focus:ring-[#34D399]/45 focus:ring-offset-2 ${
                isLight
                  ? 'bg-[#111111] text-white hover:bg-black/90 focus:ring-offset-[#F5F6F8]'
                  : 'bg-white text-[#111111] hover:bg-white/92 focus:ring-offset-[#070B10]'
              }`}
            >
              Book a demo
            </Link>
          </div>

          <div className="relative mx-auto h-[232px] w-full max-w-[380px] sm:h-[272px] lg:mx-0 lg:ml-auto">
            <div
              className="pointer-events-none absolute left-1/2 top-[54%] h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.28)_0%,rgba(52,211,153,0.08)_42%,transparent_72%)] blur-2xl sm:h-[240px] sm:w-[240px]"
              aria-hidden="true"
            />
            <div className="absolute left-1/2 top-1/2 h-[228px] w-[228px] -translate-x-1/2 -translate-y-1/2 sm:h-[268px] sm:w-[268px]">
              <Image
                src={FOOTER_ASSETS.organic}
                alt=""
                fill
                className="object-contain object-center drop-shadow-[0_24px_48px_rgba(16,185,129,0.22)]"
                sizes="(max-width: 768px) 228px, 268px"
                aria-hidden="true"
              />
            </div>
            <div
              className={`absolute left-[6%] top-[18%] flex h-[3.75rem] w-[3.75rem] items-center justify-center sm:left-[4%] sm:h-16 sm:w-16 ${glassCardClass}`}
            >
              <Image
                src={FOOTER_ASSETS.helix}
                alt=""
                width={44}
                height={44}
                className="h-9 w-9 object-contain sm:h-10 sm:w-10"
                aria-hidden="true"
              />
            </div>
            <div
              className={`absolute bottom-[14%] right-[10%] flex h-[3.75rem] w-[3.75rem] items-center justify-center sm:right-[6%] sm:h-16 sm:w-16 ${glassCardClass}`}
            >
              <Image
                src={FOOTER_ASSETS.neural}
                alt=""
                width={44}
                height={44}
                className="h-9 w-9 object-contain sm:h-10 sm:w-10"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main footer nav */}
      <section className="px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
        <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-10 md:grid-cols-[minmax(200px,1.15fr)_repeat(4,minmax(0,1fr))] lg:gap-x-10">
          <div className="md:pr-2">
            <ZordLogo size="md" variant={isLight ? 'light' : 'dark'} className="!w-auto max-w-[9rem]" />
            <p
              className={`mt-4 max-w-[272px] text-[13px] leading-[1.65] ${
                isLight ? 'text-[#6B7280]' : 'text-white/55'
              }`}
            >
              One place for teams that need bank confirmation, matching, and proof finance can stand behind.
            </p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title} className="min-w-0">
              <p className={sectionLabelClass(isLight)}>{column.title}</p>
              <div className="mt-3.5 space-y-2">
                {column.links.map((link) => {
                  const isMailto = link.href.startsWith('mailto:')
                  const isHash = link.href === '#'
                  const className = `block text-[13px] leading-[1.65] transition-colors duration-150 ${
                    isLight ? 'text-[#4B5563] hover:text-[#111111]' : 'text-white/55 hover:text-white'
                  }`

                  if (isMailto || isHash) {
                    return (
                      <a key={link.label} href={link.href} className={className}>
                        {link.label}
                      </a>
                    )
                  }

                  return (
                    <Link key={link.label} href={link.href} className={className}>
                      {link.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom bar */}
      <section
        className={`border-t px-5 py-7 sm:px-8 sm:py-8 lg:px-10 ${
          isLight ? 'border-black/[0.05] bg-black/[0.02]' : 'border-white/[0.06] bg-black/20'
        }`}
      >
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-end">
            <div className="lg:pb-0.5">
              <p className={sectionLabelClass(isLight)}>Follow us</p>
              <div className="mt-3.5 flex items-center gap-2.5">
                {socialLinks.map((social) => {
                  const Icon = social.icon
                  return (
                    <a
                      key={social.label}
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={social.label}
                      className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border shadow-[0_4px_14px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.14)] focus:outline-none focus:ring-2 focus:ring-[#34D399]/40 ${
                        isLight
                          ? 'border-black/[0.07] bg-white text-[#111111] hover:border-black/[0.12] hover:bg-[#FAFBFC]'
                          : 'border-white/14 bg-white/[0.06] text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </a>
                  )
                })}
              </div>
            </div>
          </div>

          <div
            className={`mt-7 flex flex-col items-start justify-between gap-3 border-t pt-5 sm:flex-row sm:items-center ${
              isLight ? 'border-black/[0.05]' : 'border-white/[0.06]'
            }`}
          >
            <p className={`text-[12px] leading-none ${isLight ? 'text-[#9CA3AF]' : 'text-white/40'}`}>
              Copyright © {new Date().getFullYear()} Arealis. All rights reserved.
            </p>
            <button
              type="button"
              onClick={scrollToTop}
              className={`inline-flex cursor-pointer items-center gap-2 text-[12px] leading-none transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#34D399]/40 focus:ring-offset-2 ${
                isLight
                  ? 'text-[#9CA3AF] hover:text-[#111111] focus:ring-offset-[#ECEFF3]'
                  : 'text-white/40 hover:text-white focus:ring-offset-[#030508]'
              }`}
            >
              Back to top
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </section>
    </footer>
  )
}
