'use client'

import Link from 'next/link'

import { FinalLandingNavbar, type FinalLandingNavLabel } from '@/components/landing-final/FinalLandingNavbar'
import { ZordLogo } from '@/components/ZordLogo'

const footerColumns = [
  {
    title: 'Solutions',
    links: [
      { label: 'Open finance', href: '/final-landing/solutions/open-finance' },
      { label: 'Fraud & risk prevention', href: '/final-landing/solutions/fraud-risk-prevention' },
      { label: 'Inbound bank payments', href: '/final-landing/solutions/inbound-bank-payments' },
      { label: 'Outbound bank payments', href: '/final-landing/solutions/outbound-bank-payments' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'Home', href: '/' },
      { label: 'How it works', href: '/final-landing/how-it-works' },
      { label: 'Pricing', href: '/final-landing/pricing' },
      { label: 'Console', href: '/signin' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Book demo', href: '/signup' },
      { label: 'Contact', href: 'mailto:Support@zordnet.com?subject=Talk%20to%20Zord' },
      { label: 'Resources', href: '/final-landing/resources' },
      { label: 'About Arealis', href: '/final-landing/company' },
    ],
  },
] as const

export function SolutionsSiteNav({ active = 'Solutions' }: { active?: FinalLandingNavLabel }) {
  return <FinalLandingNavbar active={active} />
}

export function SolutionsSiteFooter() {
  return (
    <footer className="border-t border-white/10 px-5 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1.2fr_repeat(3,1fr)]">
        <div>
          <ZordLogo size="md" variant="dark" className="!w-auto max-w-[9rem]" />
          <p className="mt-6 max-w-[320px] text-[13px] leading-7 text-white/50">
            Solution narratives for teams evaluating ZORD across money movement, identity, compliance, finance, and connected data workflows.
          </p>
        </div>

        {footerColumns.map((column) => (
          <div key={column.title}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">{column.title}</div>
            <div className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <Link key={link.label} href={link.href} className="block text-[13px] text-white/50 transition hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  )
}
