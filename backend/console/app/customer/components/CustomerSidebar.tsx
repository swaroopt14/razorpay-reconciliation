'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

/* ================================================================
   Icon helper - 20px outlined stroke icons
   ================================================================ */
const icons = {
  dashboard: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />,
  chart: <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />,
  warning: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />,
  queue: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />,
  intents: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />,
  journal: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />,
  replay: <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />,
  shield: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
  box: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
  folder: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />,
  download: <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />,
  link: <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />,
  code: <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />,
  webhook: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m0-3l-3-3m0 0l-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" />,
  server: <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />,
  bar: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
  money: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />,
  doc: <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />,
  alert: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />,
  bell: <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />,
  sliders: <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />,
  inbox: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />,
  settings: <><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
  moon: <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />,
  sun: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />,
  collapse: <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />,
  expand: <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />,
}

function Icon({ d, size = 20 }: { d: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="flex-shrink-0">
      {d}
    </svg>
  )
}

/* ================================================================
   Navigation structure
   ================================================================ */
interface NavItem { label: string; href: string; icon: React.ReactNode; badge?: number }
interface NavSection { id: string; title: string; items: NavItem[] }
type Environment = 'sandbox' | 'production'

const sections: NavSection[] = [
  {
    id: 'overview', title: 'Ops Overview',
    items: [
      { label: 'Dashboard', href: '/customer/overview', icon: icons.chart },
      { label: 'Exceptions & SLA', href: '/customer/exceptions', icon: icons.warning, badge: 3 },
      { label: 'Work Queue', href: '/customer/work-queue', icon: icons.queue, badge: 12 },
    ],
  },
  {
    id: 'intents', title: 'Intents',
    items: [
      { label: 'Intent Journal', href: '/customer/intents', icon: icons.journal },
      { label: 'Create Payment Request', href: '/customer/intents/create', icon: icons.intents },
      { label: 'Retry / Replay', href: '/customer/intents/replay', icon: icons.replay, badge: 5 },
      { label: 'Workflow Timeline', href: '/customer/workflow-timeline', icon: icons.bar },
    ],
  },
  {
    id: 'files', title: 'File Ops',
    items: [
      { label: 'Bulk CSV Upload', href: '/customer/files/upload', icon: icons.download },
      { label: 'Ingestion Jobs', href: '/customer/files/jobs', icon: icons.queue },
    ],
  },
  {
    id: 'evidence', title: 'Evidence',
    items: [
      { label: 'Evidence Packs', href: '/customer/evidence', icon: icons.box },
      { label: 'Evidence Explorer', href: '/customer/evidence/explorer', icon: icons.folder },
      { label: 'Export Center', href: '/customer/evidence/export', icon: icons.download },
    ],
  },
  {
    id: 'integrations', title: 'Integrations',
    items: [
      { label: 'API Logs', href: '/customer/integrations/api-logs', icon: icons.code },
      { label: 'Webhook Delivery', href: '/customer/integrations/webhooks', icon: icons.webhook, badge: 2 },
      { label: 'Adapter Status', href: '/customer/integrations/adapters', icon: icons.server },
      { label: 'Tenant Registration', href: '/customer/tenant/register', icon: icons.shield },
    ],
  },
  {
    id: 'reports', title: 'Reports',
    items: [
      { label: 'RCA Reports', href: '/customer/reports/rca', icon: icons.warning },
      { label: 'Cost Intelligence', href: '/customer/reports/cost-intelligence', icon: icons.money },
      { label: 'Payment Intelligence', href: '/customer/reports/payment-intelligence', icon: icons.chart },
      { label: 'Settlement & Recon', href: '/customer/reports/settlement', icon: icons.money },
      { label: 'Ledger View', href: '/customer/reports/ledger', icon: icons.doc },
      { label: 'Discrepancy Inbox', href: '/customer/reports/discrepancy', icon: icons.alert, badge: 7 },
    ],
  },
  {
    id: 'alerts', title: 'Alerts',
    items: [
      { label: 'Alert Rules', href: '/customer/alerts', icon: icons.sliders },
      { label: 'Alert Inbox', href: '/customer/alerts/inbox', icon: icons.inbox, badge: 4 },
    ],
  },
  {
    id: 'copilot', title: 'Copilot',
    items: [
      { label: 'Zord Prompt Layer', href: '/customer/copilot', icon: icons.code },
    ],
  },
]

const SANDBOX_ROUTE_MAP: Record<string, string> = {
  '/customer/overview': '/customer/sandbox/overview',
  '/customer/exceptions': '/customer/sandbox/exceptions',
  '/customer/work-queue': '/customer/sandbox/work-queue',
  '/customer/intents': '/customer/sandbox/intents',
  '/customer/intents/create': '/customer/sandbox/intents/create',
  '/customer/intents/replay': '/customer/sandbox/intents/replay',
  '/customer/workflow-timeline': '/customer/sandbox/workflow-timeline',
  '/customer/evidence': '/customer/sandbox/evidence',
  '/customer/evidence/explorer': '/customer/sandbox/evidence/explorer',
  '/customer/evidence/export': '/customer/sandbox/evidence/export',
  '/customer/integrations/api-logs': '/customer/sandbox/integrations/api-logs',
  '/customer/integrations/webhooks': '/customer/sandbox/integrations/webhooks',
  '/customer/integrations/adapters': '/customer/sandbox/integrations/adapters',
  '/customer/reports/settlement': '/customer/sandbox/reports/settlement',
  '/customer/reports/ledger': '/customer/sandbox/reports/ledger',
  '/customer/reports/discrepancy': '/customer/sandbox/reports/discrepancy',
}

/* ================================================================
   Sidebar Component
   ================================================================ */
export function CustomerSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [query, setQuery] = useState('')
  const [environment, setEnvironment] = useState<Environment>('production')

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    const savedEnv = localStorage.getItem('cx_env')
    if (savedEnv === 'sandbox' || savedEnv === 'production') {
      setEnvironment(savedEnv)
    }
  }, [])

  useEffect(() => {
    if (pathname?.startsWith('/customer/sandbox')) {
      setEnvironment('sandbox')
      return
    }
    if (pathname?.startsWith('/customer')) {
      setEnvironment('production')
    }
  }, [pathname])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('cx-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('cx-theme', 'light')
    }
  }

  const toSandboxHref = (href: string) => SANDBOX_ROUTE_MAP[href] ?? href
  const scopedHref = (href: string) => (environment === 'sandbox' ? toSandboxHref(href) : href)

  const isActive = (href: string) => {
    if (href === '/customer/overview' || href === '/customer/sandbox/overview') {
      return pathname === href || pathname === href.replace('/overview', '')
    }
    if (href === '/customer/intents' || href === '/customer/sandbox/intents') return pathname === href
    if (href === '/customer/evidence' || href === '/customer/sandbox/evidence') return pathname === href
    if (href === '/customer/alerts') return pathname === '/customer/alerts'
    return pathname === href || pathname?.startsWith(href + '/')
  }

  const W = collapsed ? '72px' : '260px'
  const filteredSections = sections

  const openGlobalSearch = () => {
    window.dispatchEvent(new CustomEvent('cx:open-global-search', { detail: { query } }))
  }

  return (
    <div
      className="flex flex-col cx-glass-scroll"
      style={{
        width: W,
        minWidth: W,
        transition: 'width 220ms cubic-bezier(.4,0,.2,1), min-width 220ms cubic-bezier(.4,0,.2,1)',
        height: 'calc(100vh - 3.5rem - 24px)',
        margin: '12px 10px',
        borderRadius: '18px',
        background: 'var(--glass-surface)',
        backdropFilter: `blur(var(--glass-blur)) saturate(var(--glass-saturation))`,
        WebkitBackdropFilter: `blur(var(--glass-blur)) saturate(var(--glass-saturation))`,
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--glass-shadow)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ───────────────────────────────── */}
      <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--glass-border)' }}>
        <div className="flex items-center justify-between px-3 py-3">
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--glass-item-disabled)' }}>
                Navigation
              </span>
            </div>
          ) : (
            <div className="w-1" />
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="h-9 w-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'transparent', color: 'var(--glass-item-text)', border: '1px solid transparent' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--glass-item-hover-bg)'; e.currentTarget.style.borderColor = 'var(--glass-border)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <Icon d={collapsed ? icons.expand : icons.collapse} size={18} />
          </button>
        </div>

        {/* Quick filter */}
        {!collapsed && (
          <div className="px-3 pb-3">
            <div
              className="flex items-center gap-2 rounded-[14px] px-3 h-10"
              style={{
                border: '1px solid var(--glass-border)',
                background: 'var(--glass-panel)',
                boxShadow: 'var(--glass-shadow-sm)',
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                style={{ color: 'var(--glass-item-disabled)' }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-4.3-4.3m1.8-5.2a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z"
                />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Global search…"
                className="flex-1 bg-transparent outline-none text-[13px]"
                style={{ color: 'var(--glass-item-active)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openGlobalSearch()
                }}
                onFocus={() => {
                  if (!query.trim()) return
                  openGlobalSearch()
                }}
              />
              {query ? (
                <button
                  onClick={openGlobalSearch}
                  className="text-xs font-semibold px-2 py-1 rounded-lg"
                  style={{ color: 'var(--glass-item-text)', background: 'var(--glass-item-hover-bg)' }}
                  title="Search"
                >
                  Go
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────── */}
      <nav className="flex-1 py-3 overflow-y-auto cx-glass-scroll px-2">
        {filteredSections.map((section) => (
          <div key={section.id} className="mb-3">
            {/* Section title */}
            {!collapsed && (
              <p
                className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1.5"
                style={{ color: 'var(--glass-item-disabled)' }}
              >
                {section.title}
              </p>
            )}

            {/* Items */}
            {section.items.map((item) => {
              const href = scopedHref(item.href)
              const active = isActive(href)
              return (
                <Link
                  key={`${section.id}_${item.href}`}
                  href={href}
                  title={collapsed ? item.label : undefined}
                  className="flex items-center gap-3 rounded-[10px] transition-all duration-150 relative group"
                  style={{
                    height: '42px',
                    padding: collapsed ? '0 0' : '0 12px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    background: active ? 'var(--glass-panel)' : 'transparent',
                    color: active ? 'var(--glass-item-active)' : 'var(--glass-item-text)',
                    boxShadow: active ? 'var(--glass-shadow-sm)' : 'none',
                    marginBottom: '2px',
                    border: active ? '1px solid var(--glass-border)' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--glass-item-hover-bg)'; e.currentTarget.style.color = 'var(--glass-item-hover)' } }}
                  onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--glass-item-text)' } }}
                >
                  {/* Active accent */}
                  {!collapsed && active ? (
                    <span
                      className="absolute left-1 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full"
                      style={{ background: 'var(--cx-primary)' }}
                    />
                  ) : null}
                  <span style={{ opacity: active ? 0.9 : 0.7 }}><Icon d={item.icon} /></span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-[13px] font-medium truncate">{item.label}</span>
                      {item.badge !== undefined && (
                        <span
                          className="text-[11px] font-semibold rounded-full min-w-[22px] text-center"
                          style={{
                            padding: '1px 7px',
                            background: active ? 'rgba(124,58,237,0.10)' : 'var(--glass-badge-bg)',
                            color: active ? 'var(--cx-primary)' : 'var(--glass-badge-text)',
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                      {/* Chevron for items that have sub-routes */}
                      <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </>
                  )}

                  {/* Tooltip in collapsed mode */}
                  {collapsed && (
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50"
                      style={{ background: 'var(--glass-panel)', backdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)', color: 'var(--glass-item-active)', boxShadow: 'var(--glass-shadow-sm)' }}
                    >
                      {item.label}
                      {item.badge !== undefined && <span className="ml-1.5 opacity-60">({item.badge})</span>}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        ))}

      </nav>

      {/* ── Footer ────────────────────────────────── */}
      <div className="flex-shrink-0" style={{ borderTop: '1px solid var(--glass-border)' }}>
        {/* Theme toggle (segmented control) */}
        <div className="px-3 py-3">
          <div
            className="w-full rounded-[14px] p-1 flex items-center gap-1"
            style={{
              background: 'var(--glass-panel)',
              border: '1px solid var(--glass-border)',
              boxShadow: 'var(--glass-shadow-sm)',
            }}
          >
            <button
              onClick={() => { if (isDark) toggleTheme() }}
              className="flex-1 h-9 rounded-[12px] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              style={isDark ? { color: 'var(--glass-item-text)' } : { background: 'var(--glass-item-hover-bg)', color: 'var(--glass-item-active)' }}
              title="Light"
            >
              <Icon d={icons.sun} size={16} />
              {!collapsed ? 'Light' : null}
            </button>
            <button
              onClick={() => { if (!isDark) toggleTheme() }}
              className="flex-1 h-9 rounded-[12px] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              style={!isDark ? { color: 'var(--glass-item-text)' } : { background: 'var(--glass-item-hover-bg)', color: 'var(--glass-item-active)' }}
              title="Dark"
            >
              <Icon d={icons.moon} size={16} />
              {!collapsed ? 'Dark' : null}
            </button>
          </div>
        </div>

        {/* Settings */}
        <Link
          href="#"
          className="flex items-center gap-3 transition-all duration-150"
          style={{
            height: '42px',
            padding: collapsed ? '0' : '0 16px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            color: 'var(--glass-item-text)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--glass-item-hover-bg)'; e.currentTarget.style.color = 'var(--glass-item-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--glass-item-text)' }}
        >
          <Icon d={icons.settings} size={18} />
          {!collapsed && <span className="text-[13px] font-medium">Settings</span>}
        </Link>
      </div>
    </div>
  )
}
