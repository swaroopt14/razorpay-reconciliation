'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { fetchCustomerDlq, fetchCustomerIntents } from '../_lib/customerProdApi'
import { getCustomerSearchEntries, getSmartSuggestions, intentRowsToSearchEntries, rankSearchEntries } from '../search-catalog'

type Environment = 'sandbox' | 'production'

interface CustomerTopBarProps {
  tenant?: string
  environment?: Environment
  onEnvironmentChange?: (env: Environment) => void
}

const SANDBOX_SUPPORTED_ROUTES = new Set<string>([
  '/customer/overview',
  '/customer/exceptions',
  '/customer/work-queue',
  '/customer/intents',
  '/customer/intents/create',
  '/customer/intents/replay',
  '/customer/workflow-timeline',
  '/customer/evidence',
  '/customer/evidence/explorer',
  '/customer/evidence/export',
  '/customer/integrations/webhooks',
  '/customer/integrations/api-logs',
  '/customer/integrations/adapters',
  '/customer/reports/ledger',
  '/customer/reports/settlement',
  '/customer/reports/discrepancy',
])

const isIntentDetailPath = (path: string) => /^\/customer\/intents\/[^/]+$/.test(path)

const toSandboxPath = (path: string) => {
  const normalized = path === '/customer' ? '/customer/overview' : path
  if (normalized.startsWith('/customer/sandbox')) return normalized
  if (normalized === '/customer/intents/create') return '/customer/sandbox/intents/create'
  if (SANDBOX_SUPPORTED_ROUTES.has(normalized) || isIntentDetailPath(normalized)) {
    return normalized.replace('/customer', '/customer/sandbox')
  }
  return '/customer/sandbox/overview'
}

const toProductionPath = (path: string) => {
  if (path.startsWith('/customer/sandbox')) {
    const converted = path.replace('/customer/sandbox', '/customer')
    return converted === '/customer' ? '/customer/overview' : converted
  }
  return path === '/customer' ? '/customer/overview' : path
}

export function CustomerTopBar({ tenant, environment = 'production', onEnvironmentChange }: CustomerTopBarProps) {
  const [currentEnv, setCurrentEnv] = useState<Environment>(environment)
  const [showSearch, setShowSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mounted, setMounted] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: string; title: string; desc?: string; type?: 'success' | 'warning' | 'error' | 'info' }>>([])
  const notifRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    // Restore theme from localStorage
    const saved = localStorage.getItem('cx-theme')
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(true)
        window.setTimeout(() => searchInputRef.current?.focus(), 0)
      }
      if (e.key === 'Escape') setShowSearch(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent
      const detail = (ce.detail || {}) as { title?: unknown; desc?: unknown; type?: unknown }
      const title = typeof detail.title === 'string' ? detail.title : 'Notification'
      const desc = typeof detail.desc === 'string' ? detail.desc : undefined
      const type: 'success' | 'warning' | 'error' | 'info' =
        detail.type === 'success' || detail.type === 'warning' || detail.type === 'error' || detail.type === 'info'
          ? detail.type
          : 'info'
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`

      setToasts((prev) => [{ id, title, desc, type }, ...prev].slice(0, 4))
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 2600)
    }
    window.addEventListener('cx:toast', onToast as EventListener)
    return () => window.removeEventListener('cx:toast', onToast as EventListener)
  }, [])

  useEffect(() => {
    const onOpenSearch = (e: Event) => {
      const detail = (e as CustomEvent<{ query?: string }>).detail
      if (detail?.query) setSearchQuery(detail.query)
      setShowSearch(true)
      window.setTimeout(() => searchInputRef.current?.focus(), 0)
    }
    window.addEventListener('cx:open-global-search', onOpenSearch as EventListener)
    return () => window.removeEventListener('cx:open-global-search', onOpenSearch as EventListener)
  }, [])

  useEffect(() => {
    setCurrentEnv(environment)
  }, [environment])

  const handleEnvChange = (env: Environment) => {
    const currentPath = pathname || '/customer/overview'
    const nextPath = env === 'sandbox' ? toSandboxPath(currentPath) : toProductionPath(currentPath)
    setCurrentEnv(env)
    onEnvironmentChange?.(env)
    if (nextPath !== currentPath) {
      router.push(nextPath)
    }
  }

  const [liveIntentSearch, setLiveIntentSearch] = useState<ReturnType<typeof intentRowsToSearchEntries>>([])
  const [liveNotifications, setLiveNotifications] = useState<
    Array<{ title: string; desc: string; time: string; type: 'warning' | 'error' | 'success' }>
  >([])

  useEffect(() => {
    if (currentEnv === 'sandbox') {
      setLiveIntentSearch([])
      return
    }
    void fetchCustomerIntents({ page_size: 25 }).then(({ items }) => {
      setLiveIntentSearch(intentRowsToSearchEntries(items, 'production'))
    })
    void fetchCustomerDlq().then((items) => {
      const notes = items.slice(0, 5).map((row) => ({
        title: row.reason_code || 'DLQ item',
        desc: row.error_detail || row.stage || 'Review required',
        time: 'recent',
        type: 'error' as const,
      }))
      setLiveNotifications(notes)
    })
  }, [currentEnv])

  const homeHref = currentEnv === 'sandbox' ? '/customer/sandbox/overview' : '/customer/overview'
  const searchEntries = useMemo(
    () => getCustomerSearchEntries(currentEnv, liveIntentSearch),
    [currentEnv, liveIntentSearch],
  )
  const resultEntries = useMemo(() => rankSearchEntries(searchQuery, searchEntries, 10), [searchEntries, searchQuery])
  const smartSuggestions = useMemo(() => getSmartSuggestions(searchQuery, currentEnv), [currentEnv, searchQuery])

  const openSearchResult = (href: string) => {
    setShowSearch(false)
    setSearchQuery('')
    router.push(href)
  }

  if (!mounted) return <div className="h-14" style={{ background: 'var(--glass-surface)' }} />

  return (
    <>
      {/* Top Toasts (customer-only UI notifications) */}
      {toasts.length ? (
        <div className="fixed right-4 top-4 z-[60] space-y-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="w-[360px] max-w-[92vw] rounded-[14px] px-3.5 py-3"
              style={{
                background: 'var(--glass-panel)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--glass-shadow)',
                backdropFilter: `blur(var(--glass-panel-blur))`,
                WebkitBackdropFilter: `blur(var(--glass-panel-blur))`,
              }}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className="mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{
                    background:
                      t.type === 'success'
                        ? 'var(--cx-success)'
                        : t.type === 'warning'
                          ? 'var(--cx-energy)'
                          : t.type === 'error'
                            ? 'var(--cx-danger)'
                            : 'var(--cx-primary)',
                    boxShadow: '0 0 0 6px rgba(255,255,255,0.02)',
                  }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--glass-item-active)' }}>
                    {t.title}
                  </div>
                  {t.desc ? (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--glass-item-text)' }}>
                      {t.desc}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <header
        className="h-14 flex items-center justify-between px-0 z-40 relative"
        style={{
          background: 'var(--glass-surface)',
          backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturation))',
          WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturation))',
          borderBottom: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow-sm)',
        }}
      >
        {/* Left Section */}
        <div className="flex items-center h-full">
          {/* Logo */}
          <Link href={homeHref} className="px-4 h-full flex items-center gap-2.5 transition-colors duration-[120ms]"
            style={{ color: 'var(--glass-item-active)' }}
          >
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--cx-primary)', boxShadow: '0 2px 6px rgba(124,58,237,0.25)' }}>
              <span className="text-white font-black text-xs">Z</span>
            </div>
            <span className="text-sm font-bold tracking-tight leading-none" style={{ color: 'var(--glass-item-active)' }}>
              Zord
            </span>
          </Link>

          <div
            className="mx-2 flex items-center rounded-[12px] p-0.5"
            style={{ background: 'var(--glass-item-hover-bg)', border: '1px solid var(--glass-border)' }}
            aria-label="Environment toggle"
          >
            <button
              onClick={() => handleEnvChange('production')}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-[10px] transition-all duration-[120ms]"
              style={
                currentEnv === 'production'
                  ? { background: 'var(--cx-success)', color: '#fff', boxShadow: '0 1px 4px rgba(20,184,166,0.25)' }
                  : { color: 'var(--glass-item-text)' }
              }
            >
              LIVE
            </button>
            <button
              onClick={() => handleEnvChange('sandbox')}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-[10px] transition-all duration-[120ms]"
              style={
                currentEnv === 'sandbox'
                  ? { background: 'var(--cx-energy)', color: '#fff', boxShadow: '0 1px 4px rgba(249,115,22,0.25)' }
                  : { color: 'var(--glass-item-text)' }
              }
            >
              SANDBOX
            </button>
          </div>
        </div>

        {/* Center — Global Search */}
        <div className="flex-1 flex justify-center max-w-md mx-4">
          <div
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-[10px] text-sm transition-all duration-[120ms]"
            style={{ background: 'var(--glass-item-hover-bg)', border: '1px solid var(--glass-border)', color: 'var(--glass-item-text)' }}
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                value={searchQuery}
                onFocus={() => setShowSearch(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (!showSearch) setShowSearch(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && resultEntries[0]) {
                    openSearchResult(resultEntries[0].href)
                  }
                }}
                placeholder="Search intent, beneficiary, trace, report..."
                className="w-full bg-transparent text-xs outline-none"
                style={{ color: 'var(--glass-item-active)' }}
              />
            </div>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded" style={{ background: 'var(--glass-badge-bg)', color: 'var(--glass-badge-text)' }}>⌘K</kbd>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center h-full">
          {/* Notifications */}
          <div className="relative h-full" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="px-3 h-full flex items-center transition-colors duration-[120ms] relative"
              style={{ color: 'var(--glass-item-text)' }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <span className="absolute top-3 right-2.5 w-2 h-2 rounded-full" style={{ background: 'var(--cx-energy)' }} />
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-full mt-1 w-80 rounded-[16px] z-50 overflow-hidden"
                style={{ background: 'var(--glass-panel)', backdropFilter: `blur(var(--glass-panel-blur))`, WebkitBackdropFilter: `blur(var(--glass-panel-blur))`, border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--glass-divider)' }}>
                  <span className="text-sm font-semibold" style={{ color: 'var(--glass-item-active)' }}>Notifications</span>
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full" style={{ background: 'var(--glass-badge-bg)', color: 'var(--glass-badge-text)' }}>3 new</span>
                </div>
                {/* Context (Tenant + Environment) */}
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--glass-divider)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--glass-item-disabled)' }}>
                          Tenant
                        </span>
                        <span
                          className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded-full"
                          style={{ background: 'rgba(124,58,237,0.10)', color: 'var(--cx-primary)' }}
                        >
                          Processor
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-semibold truncate" style={{ color: 'var(--glass-item-active)' }}>
                        {tenant || 'AcmePay'}
                      </div>
                    </div>

                    <span
                      className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide rounded-full flex-shrink-0"
                      style={{
                        background: currentEnv === 'sandbox' ? 'rgba(249,115,22,0.12)' : 'rgba(20,184,166,0.12)',
                        color: currentEnv === 'sandbox' ? 'var(--cx-energy)' : 'var(--cx-success)',
                      }}
                    >
                      {currentEnv === 'sandbox' ? 'Sandbox Mode' : 'Live Mode'}
                    </span>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto cx-glass-scroll">
                  {(liveNotifications.length > 0
                    ? liveNotifications
                    : [
                        {
                          title: 'No live alerts',
                          desc: 'DLQ feed is empty for this tenant',
                          time: '—',
                          type: 'success' as const,
                        },
                      ]
                  ).map((n, i) => (
                    <div key={i} className="px-4 py-3 cursor-pointer transition-colors duration-[120ms]"
                      style={{ borderBottom: '1px solid var(--glass-divider)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--glass-row-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                          style={{ background: n.type === 'warning' ? 'var(--cx-energy)' : n.type === 'error' ? 'var(--cx-danger)' : 'var(--cx-success)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium" style={{ color: 'var(--glass-item-active)' }}>{n.title}</p>
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--glass-item-text)' }}>{n.desc}</p>
                          <p className="text-[10px] mt-1" style={{ color: 'var(--glass-item-disabled)' }}>{n.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2.5" style={{ borderTop: '1px solid var(--glass-divider)' }}>
                  <Link href="/customer/alerts/inbox" className="text-xs font-medium" style={{ color: 'var(--cx-primary)' }}>
                    View all notifications →
                  </Link>
                </div>
              </div>
            )}
          </div>

          <div className="h-7 w-px" style={{ background: 'var(--glass-border)' }} />

          {/* User Menu */}
          <div className="relative h-full" ref={userRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="px-4 h-full flex items-center gap-2 text-sm transition-colors duration-[120ms]"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'var(--cx-primary)', boxShadow: '0 2px 6px rgba(124,58,237,0.2)' }}>
                O
              </div>
              <svg className="w-3 h-3 ml-1" style={{ color: 'var(--glass-item-text)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-1 w-64 rounded-[16px] z-50 overflow-hidden"
                style={{ background: 'var(--glass-panel)', backdropFilter: `blur(var(--glass-panel-blur))`, WebkitBackdropFilter: `blur(var(--glass-panel-blur))`, border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)' }}
              >
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--glass-divider)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--glass-item-active)' }}>ops@acmepay.com</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full" style={{ background: 'rgba(124,58,237,0.1)', color: 'var(--cx-primary)' }}>Ops Operator</span>
                    <span className="text-[10px]" style={{ color: 'var(--glass-item-text)' }}>AcmePay</span>
                  </div>
                </div>
                <div className="py-1">
                  {[
                    { label: 'Profile', icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' },
                    { label: 'Settings', icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z' },
                  ].map((item) => (
                    <button key={item.label} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-2 transition-colors duration-[120ms]"
                      style={{ color: 'var(--glass-item-text)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--glass-row-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <svg className="w-4 h-4" style={{ color: 'var(--glass-item-disabled)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={item.icon} /></svg>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--glass-divider)' }} className="py-1">
                  <button
                    onClick={() => router.push('/customer/login')}
                    className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-2 transition-colors duration-[120ms]"
                    style={{ color: 'var(--cx-danger)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search Modal */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowSearch(false)} />
          <div className="relative w-full max-w-2xl rounded-[16px] overflow-hidden"
            style={{ background: 'var(--glass-panel)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)', boxShadow: '0 24px 48px rgba(0,0,0,0.12)' }}
          >
            <div className="flex items-center px-5 py-4" style={{ borderBottom: '1px solid var(--glass-divider)' }}>
              <svg className="w-5 h-5 mr-3" style={{ color: 'var(--cx-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search intent_id, beneficiary_token, trace_id, route..."
                className="flex-1 text-base outline-none bg-transparent"
                style={{ color: 'var(--glass-item-active)' }}
                autoFocus
              />
              <kbd className="ml-3 px-2 py-1 text-xs font-mono rounded" style={{ background: 'var(--glass-badge-bg)', color: 'var(--glass-badge-text)', border: '1px solid var(--glass-border)' }}>ESC</kbd>
            </div>
            <div className="p-5 max-h-80 overflow-y-auto cx-glass-scroll">
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--glass-item-text)' }}>Global Results</p>
              {smartSuggestions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openSearchResult(item.href)}
                  className="flex items-center justify-between gap-3 w-full px-3 py-2.5 text-sm rounded-[10px] transition-colors duration-[120ms]"
                  style={{ color: 'var(--glass-item-text)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--glass-item-hover-bg)'; e.currentTarget.style.color = 'var(--glass-item-active)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--glass-item-text)' }}
                >
                  <span className="text-left">
                    <span className="block text-xs font-semibold">{item.title}</span>
                    <span className="block text-[11px] opacity-80">{item.subtitle}</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--glass-badge-bg)' }}>AI suggestion</span>
                </button>
              ))}
              {resultEntries.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openSearchResult(item.href)}
                  className="flex items-center justify-between gap-3 w-full px-3 py-2.5 text-sm rounded-[10px] transition-colors duration-[120ms]"
                  style={{ color: 'var(--glass-item-text)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--glass-item-hover-bg)'; e.currentTarget.style.color = 'var(--glass-item-active)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--glass-item-text)' }}
                >
                  <span className="text-left min-w-0">
                    <span className="block text-xs font-semibold truncate">{item.title}</span>
                    <span className="block text-[11px] opacity-80 truncate">{item.subtitle}</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full uppercase" style={{ background: 'var(--glass-badge-bg)' }}>
                    {item.type}
                  </span>
                </button>
              ))}
              {searchQuery.trim() && resultEntries.length === 0 && smartSuggestions.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm" style={{ color: 'var(--glass-item-text)' }}>
                  No results found. Try intent ID, trace ID, beneficiary token, or report name.
                </div>
              ) : null}
            </div>
            <div className="px-5 py-3 flex items-center justify-between text-xs" style={{ borderTop: '1px solid var(--glass-divider)', color: 'var(--glass-item-disabled)' }}>
              <div className="flex gap-4">
                <span><kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--glass-badge-bg)', border: '1px solid var(--glass-border)' }}>↑↓</kbd> navigate</span>
                <span><kbd className="px-1.5 py-0.5 rounded" style={{ background: 'var(--glass-badge-bg)', border: '1px solid var(--glass-border)' }}>⏎</kbd> select</span>
              </div>
              <span>Powered by Zord Search</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
