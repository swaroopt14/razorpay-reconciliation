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
  theme?: 'light' | 'dark'
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
        href: 'mailto:Support@zordnet.com?subject=Talk%20to%20Arealis',
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

const lightNavShellStyle = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.96) 100%)',
  boxShadow:
    '0 20px 48px rgba(0,0,0,0.08), 0 8px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.02)',
} as const

const frostedNavTrackStyle = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
  boxShadow:
    '0 14px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.14)',
} as const

const lightNavTrackStyle = {
  background:
    'linear-gradient(180deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.01) 100%)',
  boxShadow:
    'inset 0 1px 1px rgba(0,0,0,0.04)',
} as const

const frostedNavActiveStyle = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 100%)',
  boxShadow:
    '0 12px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.18)',
} as const

const lightNavActiveStyle = {
  background:
    'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.02) 100%)',
  boxShadow:
    '0 8px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)',
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
  theme = 'dark',
}: FinalLandingNavbarProps) {
  const [activeNav, setActiveNav] = useState<FinalLandingNavLabel>(active ?? 'Product')
  const [openMenu, setOpenMenu] = useState<FinalLandingNavLabel | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isLight = theme === 'light'
  const shellStyle = isLight ? lightNavShellStyle : frostedNavShellStyle
  const trackStyle = isLight ? lightNavTrackStyle : frostedNavTrackStyle
  const activeStyle = isLight ? lightNavActiveStyle : frostedNavActiveStyle

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
        className={`relative mx-auto flex w-full max-w-[1240px] items-center gap-3 rounded-[42px] border px-3 py-3 backdrop-blur-[30px] sm:gap-4 sm:px-4 sm:py-3.5 lg:gap-6 lg:px-5 ${
          isLight ? 'border-black/5' : 'border-white/12'
        }`}
        style={shellStyle}
      >
        <Link href="/" className="relative z-10 shrink-0" aria-label="Zord home">
          <ZordLogo
            size="md"
            variant={isLight ? 'light' : 'dark'}
            fitToHeight
            embedded
            className="!w-auto max-w-[9.5rem] sm:max-w-[11rem]"
          />
        </Link>
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[42px]">
          <div
            className={`absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-${
              isLight ? 'black/10' : 'white/60'
            } to-transparent`}
          />
          <div
            className={`absolute inset-0 ${
              isLight
                ? 'bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.02),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.04),transparent_24%)]'
                : 'bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(198,239,207,0.08),transparent_24%),radial-gradient(circle_at_50%_-10%,rgba(59,166,247,0.12),transparent_30%)]'
            }`}
          />
          <div
            className={`absolute inset-[1px] rounded-[40px] border ${
              isLight ? 'border-black/[0.03]' : 'border-white/[0.06]'
            }`}
          />
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
                      isActive
                        ? isLight
                          ? 'text-[#111111]'
                          : 'text-white'
                        : isLight
                        ? 'text-[#4B5563] hover:text-[#111111]'
                        : 'text-slate-300/85 hover:text-white'
                    }`}
                    style={isActive ? activeStyle : undefined}
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
                      isActive
                        ? isLight
                          ? 'text-[#111111]'
                          : 'text-white'
                        : isLight
                        ? 'text-[#4B5563] hover:text-[#111111]'
                        : 'text-slate-300/85 hover:text-white'
                    }`}
                    style={isActive ? activeStyle : undefined}
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
                      <SolutionBrowsePanel compact theme={theme} />
                    </div>
                  ) : (
                    <div
                      className={`absolute left-1/2 top-[calc(100%+14px)] z-30 w-[340px] -translate-x-1/2 overflow-hidden rounded-[28px] border p-3 shadow-[0_28px_70px_rgba(0,0,0,0.15)] backdrop-blur-[22px] ${
                        isLight ? 'border-black/5' : 'border-white/10'
                      }`}
                      style={shellStyle}
                      onMouseEnter={cancelScheduledClose}
                      onMouseLeave={() => scheduleClose(item.label)}
                    >
                      <div
                        className={`pointer-events-none absolute inset-0 ${
                          isLight
                            ? 'bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.01),transparent_28%)]'
                            : 'bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(148,167,179,0.08),transparent_30%)]'
                        }`}
                      />
                      <div className="relative z-10 space-y-1.5">
                        {item.menu?.map((entry) => (
                          <NavMenuLink
                            key={entry.label}
                            href={entry.href}
                            onClick={() => {
                              cancelScheduledClose()
                              setActiveNav(item.label)
                              setOpenMenu(null)
                            }}
                            className={`block rounded-[20px] border border-transparent px-4 py-3 transition ${
                              isLight
                                ? 'bg-black/[0.015] hover:border-black/5 hover:bg-black/[0.03]'
                                : 'bg-white/[0.02] hover:border-white/8 hover:bg-white/[0.06]'
                            }`}
                          >
                            <div
                              className={`text-[15px] font-semibold tracking-[-0.03em] ${
                                isLight ? 'text-[#111111]' : 'text-white'
                              }`}
                            >
                              {entry.label}
                            </div>
                            <div
                              className={`mt-1 text-[12px] leading-5 ${
                                isLight ? 'text-[#6B7280]' : 'text-slate-400'
                              }`}
                            >
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
            href="/signin"
            className={`hidden h-14 items-center rounded-[20px] border px-6 text-[16px] font-semibold transition lg:inline-flex ${
              isLight
                ? 'border-black/5 text-[#4B5563] hover:border-black/10 hover:text-[#111111]'
                : 'border-white/12 text-slate-100/90 hover:border-white/18 hover:text-white'
            }`}
            style={trackStyle}
          >
            Sign in
          </Link>

          <Link
            href="/signup"
            className={`flex h-14 items-center gap-2 rounded-[20px] px-6 text-[16px] font-semibold transition ${
              isLight
                ? 'bg-[#111111] text-white hover:bg-black/90 shadow-[0_12px_24px_rgba(0,0,0,0.1)]'
                : 'bg-[#c6efcf] text-[#09110c] hover:bg-[#d6f5dc] shadow-[0_16px_30px_rgba(198,239,207,0.16)]'
            }`}
          >
            <NavIcon name="arrow-up-right" className="h-4 w-4" />
            <span>Book Demo</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className={`flex h-14 w-14 items-center justify-center rounded-[20px] border transition lg:hidden ${
              isLight ? 'border-black/5 text-[#111111]' : 'border-white/8 text-white'
            }`}
            style={trackStyle}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation menu"
          >
            <NavIcon
              name="menu-dots"
              className={`h-5 w-5 ${isLight ? 'text-[#4B5563]' : 'text-[#b7b6ce]'}`}
            />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="mx-auto mt-3 max-w-[1240px] px-1 lg:hidden">
          <div
            className={`overflow-hidden rounded-[30px] border p-4 backdrop-blur-[22px] ${
              isLight ? 'border-black/5' : 'border-white/10'
            }`}
            style={shellStyle}
          >
            <div className="space-y-3">
              {navItems.map((item) => (
                <div
                  key={item.label}
                  className={`rounded-[22px] border p-3 ${
                    isLight ? 'border-black/5 bg-black/[0.01]' : 'border-white/6 bg-white/[0.03]'
                  }`}
                >
                  {item.menu?.length ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveNav(item.label)
                        setOpenMenu((current) => (current === item.label ? null : item.label))
                      }}
                      className={`flex w-full items-center justify-between gap-4 text-left text-[15px] font-semibold tracking-[-0.02em] ${
                        isLight ? 'text-[#111111]' : 'text-white'
                      }`}
                    >
                      <span>{item.label}</span>
                      <NavIcon
                        name="chevron-down"
                        className={`h-4 w-4 transition-transform ${
                          openMenu === item.label ? 'rotate-180' : ''
                        } ${isLight ? 'text-[#6B7280]' : 'text-slate-400'}`}
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
                      className={`flex items-center justify-between gap-4 text-[15px] font-semibold tracking-[-0.02em] ${
                        isLight ? 'text-[#111111]' : 'text-white'
                      }`}
                    >
                      <span>{item.label}</span>
                      <NavIcon
                        name="arrow-right"
                        className={`h-4 w-4 ${isLight ? 'text-[#6B7280]' : 'text-slate-400'}`}
                      />
                    </Link>
                  )}

                  {item.menu?.length ? (
                    <div
                      className={`mt-3 space-y-1 border-t pt-3 ${
                        isLight ? 'border-black/5' : 'border-white/8'
                      } ${openMenu !== item.label ? 'hidden' : ''}`}
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
                          className={`block rounded-[18px] px-3 py-2 transition ${
                            isLight ? 'hover:bg-black/[0.03]' : 'hover:bg-white/[0.05]'
                          }`}
                        >
                          <div
                            className={`text-[13px] font-semibold ${
                              isLight ? 'text-[#111111]' : 'text-slate-200'
                            }`}
                          >
                            {entry.label}
                          </div>
                          <div
                            className={`mt-0.5 text-[12px] leading-5 ${
                              isLight ? 'text-[#6B7280]' : 'text-slate-400'
                            }`}
                          >
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
                  href="/signin"
                  onClick={() => setMobileOpen(false)}
                  className={`flex-1 rounded-[20px] border px-4 py-3 text-center text-[15px] font-semibold ${
                    isLight
                      ? 'border-black/5 bg-black/[0.015] text-[#4B5563]'
                      : 'border-white/10 bg-white/[0.03] text-slate-200'
                  }`}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setMobileOpen(false)}
                  className={`flex-1 rounded-[20px] px-4 py-3 text-center text-[15px] font-semibold ${
                    isLight ? 'bg-[#111111] text-white' : 'bg-[#c6efcf] text-[#09110c]'
                  }`}
                >
                  Book Demo
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  )
}
