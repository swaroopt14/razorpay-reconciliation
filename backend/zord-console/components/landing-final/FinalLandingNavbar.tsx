'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { ZordLogo } from '@/components/ZordLogo'
import { SolutionBrowsePanel } from '@/components/landing-final/SolutionBrowsePanel'

export type FinalLandingNavLabel =
  | 'Product'
  | 'Solutions'
  | 'Pricing'
  | 'Customers'
  | 'Resources'
  | 'Company'

type NavMenuEntry = {
  label: string
  href: string
  note: string
}

type NavItem = {
  label: FinalLandingNavLabel
  href: string
  menu?: NavMenuEntry[]
}

type FinalLandingNavbarProps = {
  active?: FinalLandingNavLabel
  syncToHash?: boolean
}

const navItems: NavItem[] = [
  {
    label: 'Product',
    href: '/#product',
    menu: [
      {
        label: 'Platform overview',
        href: '/#product',
        note: 'Control payouts, signal quality, and proof in one operating layer.',
      },
      {
        label: 'How it works',
        href: '/#how-it-works',
        note: 'See the four-stage payout flow from request to finance-ready proof.',
      },
      {
        label: 'Security & proof',
        href: '/#security',
        note: 'Bank visibility, provider posture, and enterprise proof controls.',
      },
    ],
  },
  {
    label: 'Solutions',
    href: '/final-landing/solutions',
    menu: [
      {
        label: 'Browse use cases',
        href: '/final-landing/solutions',
        note: 'Explore ZORD by the operator problem you need to solve first.',
      },
    ],
  },
  { label: 'Pricing', href: '/final-landing/pricing' },
  { label: 'Customers', href: '/final-landing/customers' },
  {
    label: 'Resources',
    href: '/final-landing/resources',
    menu: [
      {
        label: 'Resource center',
        href: '/final-landing/resources',
        note: 'Guides, rollout paths, and buyer-ready entry points for evaluation.',
      },
      {
        label: 'How it works',
        href: '/final-landing/how-it-works',
        note: 'Walk through the observe-track-confirm-prove operating model in detail.',
      },
      {
        label: 'Pricing & rollout',
        href: '/final-landing/pricing',
        note: 'Commercial models, FAQs, and the buying motion teams ask about.',
      },
    ],
  },
  {
    label: 'Company',
    href: '/final-landing/company',
    menu: [
      {
        label: 'About Arealis',
        href: '/final-landing/company',
        note: 'See how ZORD fits inside the broader Arealis enterprise AI platform.',
      },
      {
        label: 'Customer stories',
        href: '/final-landing/customers',
        note: 'Read why operations, finance, and engineering teams adopt ZORD.',
      },
      {
        label: 'Contact Arealis',
        href: 'mailto:hello@arelais.com?subject=Talk%20to%20Arealis',
        note: 'Speak with the team building ZORD and the wider Arealis product fabric.',
      },
    ],
  },
]

const frostedNavShellStyle = {
  background:
    'linear-gradient(180deg, rgba(24,30,37,0.72) 0%, rgba(11,14,18,0.82) 100%)',
  boxShadow:
    '0 28px 60px rgba(0,0,0,0.24), 0 8px 20px rgba(9,12,16,0.18), inset 0 1px 0 rgba(255,255,255,0.16), inset 0 -1px 0 rgba(255,255,255,0.03)',
} as const

const frostedNavTrackStyle = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
  boxShadow:
    '0 14px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.14)',
} as const

const frostedNavActiveStyle = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 100%)',
  boxShadow:
    '0 12px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.18)',
} as const

function NavIcon({
  name,
  className = '',
}: {
  name:
    | 'arrow-right'
    | 'arrow-up-right'
    | 'chevron-down'
    | 'grid'
    | 'menu-dots'
  className?: string
}) {
  const base = `inline-block ${className}`

  switch (name) {
    case 'arrow-right':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 10h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="m10.5 5 5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'arrow-up-right':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M6 14 14 6M8 6h6v6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'chevron-down':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 7.5 10 12.5 15 7.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'grid':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="12" y="3" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="3" y="12" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="12" y="12" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'menu-dots':
      return (
        <svg className={base} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="15" cy="10" r="1.6" />
        </svg>
      )
    default:
      return null
  }
}

function isExternalHref(href: string) {
  return href.startsWith('mailto:') || href.startsWith('http://') || href.startsWith('https://')
}

function NavMenuLink({
  href,
  onClick,
  className,
  children,
}: {
  href: string
  onClick: () => void
  className: string
  children: React.ReactNode
}) {
  if (isExternalHref(href)) {
    return (
      <a href={href} onClick={onClick} className={className}>
        {children}
      </a>
    )
  }

  return (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  )
}

export function FinalLandingNavbar({
  active,
  syncToHash = false,
}: FinalLandingNavbarProps) {
  const [activeNav, setActiveNav] = useState<FinalLandingNavLabel>(active ?? 'Product')
  const [openMenu, setOpenMenu] = useState<FinalLandingNavLabel | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelScheduledClose = () => {
    if (closeMenuTimerRef.current) {
      clearTimeout(closeMenuTimerRef.current)
      closeMenuTimerRef.current = null
    }
  }

  const scheduleClose = (label: FinalLandingNavLabel) => {
    cancelScheduledClose()
    closeMenuTimerRef.current = setTimeout(() => {
      setOpenMenu((current) => (current === label ? null : current))
      closeMenuTimerRef.current = null
    }, 220)
  }

  useEffect(() => {
    if (!syncToHash) {
      if (active) {
        setActiveNav(active)
      }
      return
    }

    const syncActiveFromHash = () => {
      const currentHash = window.location.hash
      if (!currentHash) {
        setActiveNav('Product')
        return
      }

      const current = navItems.find((item) =>
        item.menu?.some((entry) => entry.href.endsWith(currentHash)),
      )

      setActiveNav(current?.label ?? 'Product')
    }

    syncActiveFromHash()
    window.addEventListener('hashchange', syncActiveFromHash)
    return () => window.removeEventListener('hashchange', syncActiveFromHash)
  }, [active, syncToHash])

  useEffect(() => {
    if (!mobileOpen) return

    const close = () => {
      setMobileOpen(false)
      setOpenMenu(null)
    }

    window.addEventListener('hashchange', close)
    return () => window.removeEventListener('hashchange', close)
  }, [mobileOpen])

  useEffect(() => {
    return () => {
      cancelScheduledClose()
    }
  }, [])

  return (
    <nav className="relative z-50 px-4 pt-6 sm:px-6">
      <div
        className="relative mx-auto flex w-full max-w-[1240px] items-center gap-3 rounded-[42px] border border-white/12 px-3 py-3 backdrop-blur-[30px] sm:gap-4 sm:px-4 sm:py-3.5 lg:gap-6 lg:px-5"
        style={frostedNavShellStyle}
      >
        <Link href="/" className="relative z-10 shrink-0" aria-label="Zord home">
          <ZordLogo
            size="md"
            variant="dark"
            fitToHeight
            embedded
            className="!w-auto max-w-[9.5rem] sm:max-w-[11rem]"
          />
        </Link>
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[42px]">
          <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(198,239,207,0.08),transparent_24%),radial-gradient(circle_at_50%_-10%,rgba(59,166,247,0.12),transparent_30%)]" />
          <div className="absolute inset-[1px] rounded-[40px] border border-white/[0.06]" />
        </div>

        <div className="relative z-10 hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
          {navItems.map((item) => {
            const hasMenu = Boolean(item.menu?.length)
            const isActive = activeNav === item.label

            return (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => {
                  if (!hasMenu) return
                  cancelScheduledClose()
                  setOpenMenu(item.label)
                }}
                onMouseLeave={() => {
                  if (!hasMenu) return
                  scheduleClose(item.label)
                }}
              >
                {hasMenu ? (
                  <button
                    type="button"
                    onClick={() => {
                      cancelScheduledClose()
                      setActiveNav(item.label)
                      setOpenMenu((current) => (current === item.label ? null : item.label))
                    }}
                    className={`relative inline-flex items-center gap-2 rounded-[22px] px-4 py-3 text-[16px] font-medium tracking-[-0.03em] transition-all duration-200 ${
                      isActive ? 'text-white' : 'text-slate-300/85 hover:text-white'
                    }`}
                    style={isActive ? frostedNavActiveStyle : undefined}
                    aria-expanded={openMenu === item.label}
                    aria-haspopup="menu"
                  >
                    <span>{item.label}</span>
                    <NavIcon
                      name="chevron-down"
                      className={`h-4 w-4 transition-transform duration-200 ${
                        openMenu === item.label ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    onClick={() => {
                      setActiveNav(item.label)
                      setOpenMenu(null)
                    }}
                    className={`relative inline-flex items-center rounded-[22px] px-4 py-3 text-[16px] font-medium tracking-[-0.03em] transition-all duration-200 ${
                      isActive ? 'text-white' : 'text-slate-300/85 hover:text-white'
                    }`}
                    style={isActive ? frostedNavActiveStyle : undefined}
                  >
                    {item.label}
                  </Link>
                )}

                {hasMenu && openMenu === item.label ? (
                  item.label === 'Solutions' ? (
                    <div
                      className="absolute left-1/2 top-[calc(100%+14px)] z-30 w-[980px] -translate-x-1/2 pt-2"
                      onMouseEnter={cancelScheduledClose}
                      onMouseLeave={() => scheduleClose(item.label)}
                    >
                      <SolutionBrowsePanel compact />
                    </div>
                  ) : (
                    <div
                      className="absolute left-1/2 top-[calc(100%+14px)] z-30 w-[340px] -translate-x-1/2 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,22,20,0.98)_0%,rgba(10,12,11,0.99)_100%)] p-3 shadow-[0_28px_70px_rgba(0,0,0,0.38)] backdrop-blur-[22px]"
                      style={frostedNavShellStyle}
                      onMouseEnter={cancelScheduledClose}
                      onMouseLeave={() => scheduleClose(item.label)}
                    >
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(148,167,179,0.08),transparent_30%)]" />
                      <div className="relative z-10 space-y-2">
                        {item.menu?.map((entry) => (
                          <NavMenuLink
                            key={entry.label}
                            href={entry.href}
                            onClick={() => {
                              cancelScheduledClose()
                              setActiveNav(item.label)
                              setOpenMenu(null)
                            }}
                            className="block rounded-[20px] border border-transparent bg-white/[0.02] px-4 py-3 transition hover:border-white/8 hover:bg-white/[0.06]"
                          >
                            <div className="text-[15px] font-semibold tracking-[-0.03em] text-white">
                              {entry.label}
                            </div>
                            <div className="mt-1 text-[12px] leading-5 text-slate-400">
                              {entry.note}
                            </div>
                          </NavMenuLink>
                        ))}
                      </div>
                    </div>
                  )
                ) : null}
              </div>
            )
          })}
        </div>

        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/signin/tenant"
            className="hidden h-14 items-center rounded-[20px] border border-white/12 px-6 text-[16px] font-semibold text-slate-100/90 shadow-[0_14px_24px_rgba(0,0,0,0.14)] transition hover:border-white/18 hover:text-white lg:inline-flex"
            style={frostedNavTrackStyle}
          >
            Sign in
          </Link>

          <a
            href="mailto:hello@arelais.com?subject=Book%20Demo%20for%20Zord"
            className="flex h-14 items-center gap-2 rounded-[20px] bg-[#c6efcf] px-6 text-[16px] font-semibold text-[#09110c] shadow-[0_16px_30px_rgba(198,239,207,0.16)] transition hover:bg-[#d6f5dc]"
          >
            <NavIcon name="arrow-up-right" className="h-4 w-4" />
            <span>Book Demo</span>
          </a>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/8 text-white shadow-[0_14px_24px_rgba(0,0,0,0.18)] transition hover:border-white/12 lg:hidden"
            style={frostedNavTrackStyle}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation menu"
          >
            <NavIcon name="menu-dots" className="h-5 w-5 text-[#b7b6ce]" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="mx-auto mt-3 max-w-[1240px] px-1 lg:hidden">
          <div
            className="overflow-hidden rounded-[30px] border border-white/10 p-4 backdrop-blur-[22px]"
            style={frostedNavShellStyle}
          >
            <div className="space-y-4">
              {navItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[22px] border border-white/6 bg-white/[0.03] p-3"
                >
                  {item.menu?.length ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveNav(item.label)
                        setOpenMenu((current) => (current === item.label ? null : item.label))
                      }}
                      className="flex w-full items-center justify-between gap-4 text-left text-[15px] font-semibold tracking-[-0.02em] text-white"
                    >
                      <span>{item.label}</span>
                      <NavIcon
                        name="chevron-down"
                        className={`h-4 w-4 text-slate-400 transition-transform ${
                          openMenu === item.label ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={() => {
                        setActiveNav(item.label)
                        setMobileOpen(false)
                        setOpenMenu(null)
                      }}
                      className="flex items-center justify-between gap-4 text-[15px] font-semibold tracking-[-0.02em] text-white"
                    >
                      <span>{item.label}</span>
                      <NavIcon name="arrow-right" className="h-4 w-4 text-slate-400" />
                    </Link>
                  )}

                  {item.menu?.length ? (
                    <div
                      className={`mt-3 space-y-2 border-t border-white/8 pt-3 ${
                        openMenu !== item.label ? 'hidden' : ''
                      }`}
                    >
                      {item.menu.map((entry) => (
                        <NavMenuLink
                          key={entry.label}
                          href={entry.href}
                          onClick={() => {
                            setActiveNav(item.label)
                            setMobileOpen(false)
                            setOpenMenu(null)
                          }}
                          className="block rounded-[18px] px-3 py-2 transition hover:bg-white/[0.05]"
                        >
                          <div className="text-[13px] font-semibold text-slate-200">
                            {entry.label}
                          </div>
                          <div className="mt-1 text-[12px] leading-5 text-slate-400">
                            {entry.note}
                          </div>
                        </NavMenuLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}

              <div className="flex items-center gap-3 pt-2">
                <Link
                  href="/signin/tenant"
                  onClick={() => setMobileOpen(false)}
                  className="flex-1 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-[15px] font-semibold text-slate-200"
                >
                  Sign in
                </Link>
                <a
                  href="mailto:hello@arelais.com?subject=Book%20Demo%20for%20Zord"
                  className="flex-1 rounded-[20px] bg-[#c6efcf] px-4 py-3 text-center text-[15px] font-semibold text-[#09110c]"
                >
                  Book Demo
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  )
}
