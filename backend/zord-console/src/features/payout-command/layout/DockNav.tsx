'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { ZordLogo } from '@/components/ZordLogo'
import { useEnvironment } from '@/services/auth/EnvironmentProvider'
import { payoutBatchCommandCenterHref } from '@/services/payout-command/batchCommandCenterHref'
import {
  DEMO_SMOKE_BATCH_ID,
  getActiveDemoBatchId,
  sandboxDockHref,
  setActiveDemoBatchId,
  withDemoBatchScope,
} from '@/services/payout-command/demo/ycDemoConstants'
import { type DockId, type GlyphName } from '@/services/payout-command/model'
import type { OpsInsightAlert } from '../command-center/types'
import { ModeTogglePill } from '../sandbox/ModeTogglePill'
import { TopbarUtilityCluster } from './TopbarUtilityCluster'
import { Glyph } from '../shared'

const SIDEBAR_COLLAPSE_KEY = 'zord-console-sidebar-collapsed'

/** Compact top bar - only demo-critical destinations (rest live in the left rail). */
type TopProductLink = {
  id: string
  label: string
  icon: GlyphName
  dock?: DockId
  href?: string
  match: (dock: DockId, pathname: string) => boolean
}

/** Top bar mirrors sidebar Part 1 - always batch-scoped. */
function buildTopProductLinks(uploadHref: string, intentHref: string, batchScoped: (path: string) => string): TopProductLink[] {
  return [
    {
      id: 'home',
      label: 'Overview',
      icon: 'home',
      href: batchScoped('/overview'),
      match: (_d, pathname) => pathname.startsWith('/overview'),
    },
    {
      id: 'upload',
      label: 'Upload',
      icon: 'folder',
      href: uploadHref,
      match: (_d, pathname) =>
        pathname.includes('batch-command-center') || pathname.startsWith('/payouts/new'),
    },
    {
      id: 'intents',
      label: 'Intent',
      icon: 'banknote',
      href: intentHref,
      match: (d, pathname) =>
        pathname.startsWith('/payouts/intents') ||
        (pathname.startsWith('/sandbox') && d === 'grid') ||
        (d === 'grid' &&
          !pathname.startsWith('/connections') &&
          !pathname.startsWith('/controls') &&
          !pathname.startsWith('/contracts') &&
          !pathname.startsWith('/overview') &&
          !pathname.includes('batch-command-center')),
    },
    {
      id: 'settlement',
      label: 'Settlement',
      icon: 'settlement',
      href: batchScoped('/settlement/journal'),
      match: (_d, pathname) => pathname.startsWith('/settlement/journal'),
    },
    {
      id: 'proof',
      label: 'Proof',
      icon: 'eye',
      href: batchScoped('/proof'),
      match: (_d, pathname) => pathname.startsWith('/proof'),
    },
  ]
}

type NavLinkItem = {
  id: string
  label: string
  icon: GlyphName
  href?: string
  dock?: DockId
  match: boolean
  ariaLabel: string
}

type DockNavProps = {
  activeDock: DockId
  onDockChange: (id: DockId) => void
  alerts?: readonly OpsInsightAlert[]
  onActivateClick: () => void
  children?: ReactNode
}

/**
  * Zord console chrome - left rail is primary IA (demo path + more).
  * Top bar keeps only the highest-signal demo destinations.
  */
export function DockNav({
  activeDock,
  onDockChange,
  alerts,
  onActivateClick,
  children,
}: DockNavProps) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const { mode } = useEnvironment()
  /** Instant highlight while the destination page is still loading. */
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  /** Admin `?tab=` without useSearchParams (avoids Suspense on the whole shell). */
  const [adminTab, setAdminTab] = useState('team')
  /** Active batch - kept in sync so every menu link opens the same batch. */
  const [activeBatchId, setActiveBatchId] = useState(DEMO_SMOKE_BATCH_ID)
  const stallNavTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setPendingHref(null)
    setActiveBatchId(getActiveDemoBatchId())
    if (stallNavTimerRef.current) {
      window.clearTimeout(stallNavTimerRef.current)
      stallNavTimerRef.current = null
    }
    if (pathname === '/admin' || pathname === '/admin/') {
      try {
        setAdminTab(new URLSearchParams(window.location.search).get('tab') ?? 'team')
      } catch {
        setAdminTab('team')
      }
    }
  }, [pathname])

  // Clear optimistic highlight if navigation stalls (same-route query changes included).
  useEffect(() => {
    if (!pendingHref) return
    const t = window.setTimeout(() => setPendingHref(null), 1200)
    return () => window.clearTimeout(t)
  }, [pendingHref])

  useEffect(
    () => () => {
      if (stallNavTimerRef.current) window.clearTimeout(stallNavTimerRef.current)
    },
    [],
  )

  const scopeHref = useCallback(
    (href: string) => withDemoBatchScope(href, activeBatchId),
    [activeBatchId],
  )

  const onOverview = pathname.startsWith('/overview')
  const onConnections = pathname.startsWith('/connections')
  const onPolicies = pathname.startsWith('/controls/policies')
  const onControlReview = pathname.startsWith('/controls/review')
  const onActionContract = pathname.startsWith('/contracts')
  const onDispatchRelay = pathname.startsWith('/execution')
  const onPaymentTrace = pathname.startsWith('/payments')
  const onSettlementJournal = pathname.startsWith('/settlement/journal')
  const onOutcomeReview = pathname.startsWith('/settlement/review')
  const onPaymentGaps = pathname.startsWith('/settlement/gaps')
  const onProofCenter = pathname.startsWith('/proof')
  const onDeveloper = pathname.startsWith('/developer')
  const onAskZord = pathname.startsWith('/ask') || (pathname.startsWith('/sandbox') && activeDock === 'workspace')
  const onWorkspaceAdmin = pathname === '/admin' || pathname === '/admin/'
  const onAdminTeam =
    onWorkspaceAdmin && (adminTab === 'team' || adminTab === 'roles' || adminTab === 'access')
  const onAdminAudit = onWorkspaceAdmin && adminTab === 'audit'
  const onAdminSupport = onWorkspaceAdmin && adminTab === 'support'

  const hrefIsPending = useCallback(
    (href: string | undefined) => {
      if (!pendingHref || !href) return false
      const [pPath, pQuery = ''] = pendingHref.split('?')
      const [hPath, hQuery = ''] = href.split('?')
      if (pPath !== hPath) return false
      const pq = new URLSearchParams(pQuery)
      const hq = new URLSearchParams(hQuery)
      if (hPath === '/admin') {
        return (pq.get('tab') ?? 'team') === (hq.get('tab') ?? 'team')
      }
      if (hPath === '/sandbox' || hPath.startsWith('/sandbox')) {
        return (pq.get('dock') ?? '') === (hq.get('dock') ?? '')
      }
      return true
    },
    [pendingHref],
  )

  const navActive = useCallback(
    (href: string | undefined, pathMatch: boolean) => {
      if (pendingHref) return hrefIsPending(href)
      return pathMatch
    },
    [pendingHref, hrefIsPending],
  )
  const onControls = pathname.startsWith('/controls') || onActionContract
  const onIntents =
    pathname.startsWith('/payouts/intents') ||
    (pathname.startsWith('/sandbox') && activeDock === 'grid') ||
    (activeDock === 'grid' &&
      !onConnections &&
      !onControls &&
      !onOverview &&
      !pathname.includes('batch-command-center'))
  const onNewPayout =
    pathname.includes('batch-command-center') || pathname.startsWith('/payouts/new')

  const batchCenterHref = payoutBatchCommandCenterHref(
    pathname.startsWith('/sandbox') ||
      mode === 'sandbox' ||
      pathname.startsWith('/overview') ||
      pathname.startsWith('/connections') ||
      pathname.startsWith('/controls') ||
      pathname.startsWith('/contracts') ||
      pathname.startsWith('/execution') ||
      pathname.startsWith('/payments') ||
      pathname.startsWith('/settlement') ||
      pathname.startsWith('/proof') ||
      pathname.startsWith('/payouts') ||
      pathname.startsWith('/developer') ||
      pathname.startsWith('/admin'),
  )
  const uploadHref = scopeHref(`${batchCenterHref.split('?')[0]}?upload=1`)
  /** Direct sandbox journal - avoids /payouts/intents redirect hop + keeps batch. */
  const intentHref = sandboxDockHref('grid', activeBatchId)
  const topProductLinks = useMemo(
    () => buildTopProductLinks(uploadHref, intentHref, scopeHref),
    [uploadHref, intentHref, scopeHref],
  )

  const onDockSurface = (dock: DockId) =>
    !onConnections &&
    !onControls &&
    !onDispatchRelay &&
    !onPaymentTrace &&
    !onSettlementJournal &&
    !onOutcomeReview &&
    !onPaymentGaps &&
    !onProofCenter &&
    !onOverview &&
    !onNewPayout &&
    !onIntents &&
    activeDock === dock

  /**
    * Part 1 - primary ops (same idea as Home / Transactions / Settlements / Reports).
    * Overview · Upload · Intent · Settlement · Proof
    */
  const part1Nav: NavLinkItem[] = useMemo(
    () => [
      {
        id: 'overview',
        label: 'Overview',
        icon: 'home',
        href: scopeHref('/overview'),
        match: onOverview,
        ariaLabel: 'Overview. Workspace health and attention queue.',
      },
      {
        id: 'upload',
        label: 'Upload',
        icon: 'folder',
        href: uploadHref,
        match: onNewPayout,
        ariaLabel: 'Upload. Create payout obligations from file, form, or API.',
      },
      {
        id: 'intent',
        label: 'Intent',
        icon: 'banknote',
        href: intentHref,
        match: onIntents,
        ariaLabel: 'Intent Journal. Payment instructions before and after seal.',
      },
      {
        id: 'dispatch',
        label: 'Dispatch',
        icon: 'payout',
        href: scopeHref('/execution/dispatches'),
        match: onDispatchRelay,
        ariaLabel: 'Dispatch & Relay. Send sealed instructions through approved rails.',
      },
      {
        id: 'trace',
        label: 'Trace',
        icon: 'arrow-up-right',
        href: scopeHref('/payments'),
        match: onPaymentTrace,
        ariaLabel: 'Payment Trace. Follow a payout from dispatch to final outcome.',
      },
      {
        id: 'settlement',
        label: 'Settlement',
        icon: 'settlement',
        href: scopeHref('/settlement/journal'),
        match: onSettlementJournal,
        ariaLabel: 'Settlement Journal. Expected vs observed outcomes.',
      },
      {
        id: 'proof',
        label: 'Proof',
        icon: 'eye',
        href: scopeHref('/proof'),
        match: onProofCenter,
        ariaLabel: 'Proof Center. Evidence packs and verification.',
      },
    ],
    [
      scopeHref,
      intentHref,
      uploadHref,
      onOverview,
      onNewPayout,
      onIntents,
      onDispatchRelay,
      onPaymentTrace,
      onSettlementJournal,
      onProofCenter,
    ],
  )

  /** Part 2 - govern before money moves. */
  const controlsNav: NavLinkItem[] = useMemo(
    () => [
      {
        id: 'connections',
        label: 'Connections',
        icon: 'link',
        href: scopeHref('/connections'),
        match: onConnections,
        ariaLabel: 'Connections. Source systems, rails, and outcome feeds.',
      },
      {
        id: 'policies',
        label: 'Policies',
        icon: 'shield',
        href: scopeHref('/controls/policies'),
        match: onPolicies,
        ariaLabel: 'Policy Studio. Rules a payout must satisfy before release.',
      },
      {
        id: 'control-review',
        label: 'Control Review',
        icon: 'check',
        href: scopeHref('/controls/review'),
        match: onControlReview,
        ariaLabel: 'Control Review. Resolve blocked or warned payouts before money moves.',
      },
      {
        id: 'action-contract',
        label: 'Action Contract',
        icon: 'lock',
        href: scopeHref('/contracts/PAC-0001'),
        match: onActionContract,
        ariaLabel: 'Payment Action Contract. The signed, policy-bound instruction.',
      },
    ],
    [scopeHref, onConnections, onPolicies, onControlReview, onActionContract],
  )

  /** Part 3 - secondary tools. */
  const moreNav: NavLinkItem[] = useMemo(() => {
    return [
      {
        id: 'outcome',
        label: 'Outcome Review',
        icon: 'chart',
        href: scopeHref('/settlement/review'),
        match: onOutcomeReview,
        ariaLabel: 'Outcome Review. Exact, short, return, or unresolved.',
      },
      {
        id: 'gaps',
        label: 'Payment Gaps',
        icon: 'gaps',
        href: scopeHref('/settlement/gaps'),
        match: onPaymentGaps,
        ariaLabel: 'Payment Gaps. Value requiring review and potential exposure.',
      },
      {
        id: 'ask',
        label: 'Ask Zord',
        icon: 'terminal',
        href: scopeHref('/ask'),
        match: onAskZord,
        ariaLabel: 'Ask Zord. Investigate and navigate with citations.',
      },
      {
        id: 'billing',
        label: 'Billing',
        icon: 'billing',
        href: sandboxDockHref('billing', activeBatchId),
        match: onDockSurface('billing'),
        ariaLabel: 'Billing.',
      },
    ]
  }, [
    scopeHref,
    activeBatchId,
    onAskZord,
    onOutcomeReview,
    onPaymentGaps,
    activeDock,
    pathname,
    onOverview,
    onNewPayout,
    onIntents,
    onConnections,
    onControls,
    onDispatchRelay,
    onPaymentTrace,
    onSettlementJournal,
    onProofCenter,
  ])

  /** Spec secondary rail (bottom): Developer · Team & Access · Audit Log · Support. */
  const secondaryNav: NavLinkItem[] = useMemo(
    () => [
      {
        id: 'developer',
        label: 'Developer',
        icon: 'key',
        href: scopeHref('/developer?tab=keys'),
        match: onDeveloper,
        ariaLabel: 'Developer & Integrations. API keys, webhooks, schemas, and quickstart.',
      },
      {
        id: 'team-access',
        label: 'Team & Access',
        icon: 'users',
        href: scopeHref('/admin?tab=team'),
        match: onAdminTeam,
        ariaLabel: 'Workspace administration. Team, roles, and access policies.',
      },
      {
        id: 'audit-log',
        label: 'Audit Log',
        icon: 'copy',
        href: scopeHref('/admin?tab=audit'),
        match: onAdminAudit,
        ariaLabel: 'Audit log. Actor, action, object, reason, and before/after.',
      },
      {
        id: 'support',
        label: 'Support',
        icon: 'support',
        href: scopeHref('/admin?tab=support'),
        match: onAdminSupport,
        ariaLabel: 'Support. Raise tickets with contract, batch, trace, or proof context.',
      },
    ],
    [scopeHref, onDeveloper, onAdminTeam, onAdminAudit, onAdminSupport],
  )

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const visibleAlerts = useMemo(
    () => (alerts ?? []).filter((a) => !dismissed.has(a.id)),
    [alerts, dismissed],
  )
  const alertCount = visibleAlerts.length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileNavOpen) setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen])

  const handleDockSelect = useCallback(
    (id: DockId) => {
      onDockChange(id)
      setMobileNavOpen(false)
    },
    [onDockChange],
  )

  /** Razorpay-style: rounded active pill only - no black edge rails. */
  const navItemClass = (active: boolean, collapsed: boolean) =>
    `group flex h-9 items-center rounded-[8px] text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2563EB]/30 ${
      collapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5'
    } ${
      active
        ? 'bg-[#E8EAED] font-semibold text-[#0B1324]'
        : 'font-medium text-[#64748B] hover:bg-[#EEF1F4] hover:text-[#0F172A]'
    }`

  const markPendingNav = useCallback((href: string) => {
    setPendingHref(href)
    try {
      const q = new URLSearchParams(href.split('?')[1] ?? '')
      const batch = q.get('batch_id')?.trim() || q.get('client_batch_id')?.trim()
      if (batch) {
        setActiveDemoBatchId(batch)
        setActiveBatchId(batch)
      }
      if (href.startsWith('/admin')) {
        setAdminTab(q.get('tab') ?? 'team')
      }
    } catch {
      /* ignore */
    }
  }, [])

  /**
    * Soft nav from the heavy `/sandbox` client shell often stalls (highlight changes, URL does not).
    * Drive `router.push` ourselves and hard-assign if the location never moves.
    */
  const navigateTo = useCallback(
    (href: string) => {
      markPendingNav(href)
      setMobileNavOpen(false)
      if (stallNavTimerRef.current) {
        window.clearTimeout(stallNavTimerRef.current)
        stallNavTimerRef.current = null
      }
      const start = `${window.location.pathname}${window.location.search}`
      router.push(href)
      stallNavTimerRef.current = window.setTimeout(() => {
        stallNavTimerRef.current = null
        const now = `${window.location.pathname}${window.location.search}`
        if (now === start) {
          window.location.assign(href)
        }
      }, 700)
    },
    [markPendingNav, router],
  )

  const renderNavItem = (item: NavLinkItem, collapsed: boolean) => {
    const active = navActive(item.href, item.match)
    const iconClass = `h-4 w-4 shrink-0 ${
      active ? 'text-[#0B1324]' : 'text-[#94A3B8] group-hover:text-[#64748B]'
    }`
    const label = !collapsed ? (
      <span className="truncate text-[13px] tracking-[-0.01em]">{item.label}</span>
    ) : null

    if (item.href) {
      return (
        <Link
          key={item.id}
          href={item.href}
          prefetch
          title={item.label}
          aria-label={item.ariaLabel}
          aria-current={active ? 'page' : undefined}
          className={navItemClass(active, collapsed)}
          onClick={(e) => {
            e.preventDefault()
            navigateTo(item.href!)
          }}
        >
          <Glyph name={item.icon} className={iconClass} />
          {label}
        </Link>
      )
    }

    return (
      <button
        key={item.id}
        type="button"
        title={item.label}
        aria-label={item.ariaLabel}
        aria-current={active ? 'page' : undefined}
        className={navItemClass(active, collapsed)}
        onClick={() => {
          if (item.dock) handleDockSelect(item.dock)
        }}
      >
        <Glyph name={item.icon} className={iconClass} />
        {label}
      </button>
    )
  }

  const sectionLabel = (text: string, collapsed: boolean) =>
    collapsed ? null : (
      <p className="mb-1 mt-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
        {text}
      </p>
    )

  const renderSidebarNav = (collapsed: boolean) => (
    <nav
      className={`flex min-h-full flex-1 flex-col gap-0.5 pb-3 pt-2 ${collapsed ? 'px-1.5' : 'px-2.5'}`}
      aria-label="Workspace navigation"
    >
      {/* Part 1 - primary ops (Overview / Upload / Intent / Settlement / Proof) */}
      {part1Nav.map((item) => renderNavItem(item, collapsed))}

      <div className={`my-2 ${collapsed ? 'mx-1' : 'mx-2.5'} border-t border-[#E2E8F0]`} />
      {sectionLabel('Controls', collapsed)}
      {controlsNav.map((item) => renderNavItem(item, collapsed))}

      <div className={`my-2 ${collapsed ? 'mx-1' : 'mx-2.5'} border-t border-[#E2E8F0]`} />
      {sectionLabel('More', collapsed)}
      {moreNav.map((item) => renderNavItem(item, collapsed))}

      <div className="mt-auto" />
      <div className={`my-2 ${collapsed ? 'mx-1' : 'mx-2.5'} border-t border-[#E2E8F0]`} />
      {sectionLabel('Workspace', collapsed)}
      {secondaryNav.map((item) => renderNavItem(item, collapsed))}
    </nav>
  )

  return (
    /* Black top bar + white workspace with soft top corners into the black. */
    <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#000000]">
      <header className="payout-command-topbar z-50 shrink-0 text-white">
        <div className="flex h-[56px] w-full items-center gap-4 px-4 sm:px-5">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#2F2F2F] bg-[#1C1C1C] text-[#D4D4D4] hover:bg-[#242424] lg:hidden"
            aria-label="Open navigation"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M2.5 4h11M2.5 8h11M2.5 12h11"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <Link
            href="/"
            className="flex shrink-0 items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
            aria-label="Zord home"
          >
            <ZordLogo size="lg" variant="dark" withWordmark />
          </Link>

          <nav
            className="hidden min-w-0 items-center gap-1 overflow-x-auto md:flex"
            aria-label="Product navigation"
          >
            {topProductLinks.map((link) => {
              const active = navActive(link.href, link.match(activeDock, pathname))
              const className = `zord-top-link relative flex h-[56px] shrink-0 items-center gap-2 px-3.5 text-[13.5px] transition-colors ${
                active
                  ? 'zord-top-link--active font-semibold text-white'
                  : 'font-medium text-[#A1A1AA] hover:text-white'
              }`
              const inner = (
                <>
                  <Glyph
                    name={link.icon}
                    className={`relative z-[1] h-4 w-4 ${active ? 'text-white' : 'text-[#71717A]'}`}
                  />
                  <span className="relative z-[1] whitespace-nowrap tracking-[-0.01em]">
                    {link.label}
                  </span>
                </>
              )

              if (link.href) {
                return (
                  <Link
                    key={link.id}
                    href={link.href}
                    prefetch
                    className={className}
                    aria-current={active ? 'page' : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      navigateTo(link.href!)
                    }}
                  >
                    {inner}
                  </Link>
                )
              }

              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => {
                    if (link.dock) onDockChange(link.dock)
                  }}
                  className={className}
                  aria-current={active ? 'page' : undefined}
                >
                  {inner}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2.5 pl-4">
            <div className="hidden shrink-0 lg:block">
              <ModeTogglePill onActivateClick={onActivateClick} compact />
            </div>
            <TopbarUtilityCluster
              alerts={visibleAlerts}
              alertCount={alertCount}
              deskRole="Ops supervisor"
              onDismissAlert={(id) => setDismissed((s) => new Set(s).add(id))}
            />
          </div>
        </div>
      </header>

      {/* Rounded top only - black shows in the corner cutouts, no side gutters. */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-t-[20px] bg-[#FFFFFF]">
        <aside
          className={`payout-command-sidebar z-40 hidden h-full shrink-0 flex-col bg-[#FFFFFF] transition-[width] duration-200 ease-out lg:flex ${
            sidebarCollapsed ? 'w-[68px]' : 'w-[220px]'
          }`}
          aria-label="Console sidebar"
        >
          <div className="pc-nav-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
            {renderSidebarNav(sidebarCollapsed)}
          </div>
          <div
            className={`shrink-0 border-t border-[#E2E8F0] py-2 ${
              sidebarCollapsed ? 'flex justify-center' : 'px-2.5'
            }`}
          >
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="flex h-8 w-full items-center justify-center gap-2 rounded-[8px] text-[#94A3B8] transition hover:bg-[#E8EAED] hover:text-[#334155]"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
                {sidebarCollapsed ? (
                  <path
                    d="M6 3.5 10.5 8 6 12.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : (
                  <path
                    d="M10 3.5 5.5 8 10 12.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
              {!sidebarCollapsed ? <span className="text-[12px] font-medium">Collapse</span> : null}
            </button>
          </div>
        </aside>

        {mobileNavOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[70] bg-slate-900/45 lg:hidden"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-[75] flex w-[min(18rem,88vw)] flex-col bg-white shadow-2xl lg:hidden">
              <div className="flex h-16 items-center justify-between bg-[linear-gradient(125deg,#050816_0%,#0A1628_55%,#0F3A4A_100%)] px-4">
                <ZordLogo size="lg" variant="dark" withWordmark />
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-none border border-[#0B1324]/20/35 bg-[#0B1F33]/60 text-[#0B1324] hover:border-[#0B1324]/20/55"
                  aria-label="Close menu"
                >
                  <span className="text-[18px] leading-none">×</span>
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {renderSidebarNav(false)}
              </div>
            </aside>
          </>
        ) : null}

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#FFFFFF]">
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  )
}
