'use client'

import Link from 'next/link'

import { landingHomeCopy } from '@/components/landing-final/copy/landingHomeCopy'
import { LANDING_SECTION_SHELL } from '@/components/landing-final/landingSectionLayout'
import { ZordLogo } from '@/components/ZordLogo'

const footerColumns = [
  { title: 'Product', links: ['ZORD Platform', 'Operations Switchboard', 'Payout workspace', 'Evidence Packs'] },
  { title: 'Solutions', links: ['Marketplaces', 'NBFCs', 'Fintech & PSPs', 'Finance Ops'] },
  { title: 'Resources', links: ['How it Works', 'Security', 'Pricing', 'Support'] },
  { title: 'Company', links: ['About Arealis', 'Careers', 'Contact'] },
  { title: 'Legal', links: ['Privacy', 'Terms', 'Compliance'] },
] as const

export function LandingProductFooter() {
  return (
    <footer id="developers" className="scroll-mt-32 pb-12 pt-16 lg:pb-16">
      <div className={LANDING_SECTION_SHELL}>
        <div className="grid gap-10 border-t border-[#E5E7EB] pt-10 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div>
            <ZordLogo size="md" variant="light" className="!w-auto max-w-[9rem]" />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-[#666666]">{landingHomeCopy.footer.body}</p>
            <p className="mt-3 text-sm text-[#666666]">Support@zordnet.com</p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">{column.title}</p>
              <div className="mt-4 space-y-2">
                {column.links.map((link) => (
                  <div key={link} className="cursor-pointer text-[13px] text-[#4B5563] transition-colors duration-150 hover:text-[#1A1A1A]">
                    {link}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#E5E7EB] pt-8 md:flex-row">
          <p className="text-xs text-[#9CA3AF]">© 2026 Arealis</p>
          <div className="flex gap-6 text-xs text-[#9CA3AF]">
            <Link href="#" className="transition-colors duration-150 hover:text-[#1A1A1A]">
              Privacy
            </Link>
            <Link href="#" className="transition-colors duration-150 hover:text-[#1A1A1A]">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
