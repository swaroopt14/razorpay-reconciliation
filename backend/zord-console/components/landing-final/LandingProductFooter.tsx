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
    <footer id="developers" className="scroll-mt-32 pb-12 pt-16 lg:pb-16 bg-[#111111] text-white">
      <div className={LANDING_SECTION_SHELL}>
        <div className="grid gap-10 pt-10 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl text-white">Zord</span>
              <span className="w-5 h-5 bg-[#DBF33C] rounded-sm flex items-center justify-center">
                <span className="w-2 h-2 bg-[#111111] rounded-full" />
              </span>
            </div>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/60">{landingHomeCopy.footer.body}</p>
            <p className="mt-3 text-sm text-white/60">Support@zordnet.com</p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#DBF33C]">{column.title}</p>
              <div className="mt-4 space-y-2">
                {column.links.map((link) => (
                  <div key={link} className="cursor-pointer text-[13px] text-white/70 transition-colors duration-150 hover:text-white">
                    {link}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-xs text-white/50">© 2026 Arealis</p>
          <div className="flex gap-6 text-xs text-white/50">
            <Link href="#" className="transition-colors duration-150 hover:text-white">
              Privacy
            </Link>
            <Link href="#" className="transition-colors duration-150 hover:text-white">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
