'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Icons
const Icons = {
  Dashboard: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
    </svg>
  ),
  Tenants: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  ),
  Infrastructure: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  ),
  Security: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  Home: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  ),
  Ingress: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  ),
  DataStore: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  ),
  Governance: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
  ),
  Evidence: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  Operations: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  ),
}

interface NavItem {
  label: string
  href: string
}

interface NavSection {
  id: string
  title: string
  icon: keyof typeof Icons
  items: NavItem[]
  collapsible?: boolean
}

export function OpsSidebar() {
  const pathname = usePathname()
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // ZORD • INTERNAL OPS navigation
  const opsNavigation: NavSection[] = useMemo(() => [
    {
      id: 'dashboards',
      title: 'Dashboards',
      icon: 'Dashboard',
      items: [
        { label: 'Platform Health', href: '/console/dashboards/platform-health' },
        { label: 'Tenant Health', href: '/console/dashboards/tenant-health' },
        { label: 'Incidents & Hot Queue', href: '/console/dashboards/incidents' },
      ],
      collapsible: true,
    },
    {
      id: 'tenants',
      title: 'Tenants',
      icon: 'Tenants',
      items: [
        { label: 'Tenant Directory', href: '/console/tenants' },
        { label: 'Tenant Drilldown', href: '/console/tenants/drilldown' },
        { label: 'Tenant Incidents', href: '/console/tenants/t_91af/incidents' },
      ],
      collapsible: true,
    },
    {
      id: 'infrastructure',
      title: 'Infrastructure',
      icon: 'Infrastructure',
      items: [
        { label: 'Deployments', href: '/console/infrastructure/deployments' },
        { label: 'Feature Flags', href: '/console/infrastructure/feature-flags' },
        { label: 'Storage Health', href: '/console/infrastructure/storage' },
        { label: 'KMS & Secrets', href: '/console/infrastructure/kms' },
      ],
      collapsible: true,
    },
    {
      id: 'security',
      title: 'Security',
      icon: 'Security',
      items: [
        { label: 'Access Logs', href: '/console/security/access-logs' },
        { label: 'Admin Actions Ledger', href: '/console/security/admin-actions' },
        { label: 'Threat Signals', href: '/console/security/threats' },
      ],
      collapsible: true,
    },
  ], [])

  // ZORD • INGESTION navigation
  const ingestionNavigation: NavSection[] = useMemo(() => [
    {
      id: 'service-home',
      title: 'Service Home',
      icon: 'Home',
      items: [
        { label: 'Overview', href: '/console/ingestion' },
      ],
      collapsible: false,
    },
    {
      id: 'ingress',
      title: 'Ingress',
      icon: 'Ingress',
      items: [
        { label: 'API Ingestion', href: '/console/ingestion/api' },
        { label: 'Webhook Ingestion', href: '/console/ingestion/webhooks' },
        { label: 'Stream Ingestion', href: '/console/ingestion/streams' },
        { label: 'Batch Ingestion', href: '/console/ingestion/batch' },
      ],
      collapsible: true,
    },
    {
      id: 'ledgers',
      title: 'Ledgers & Journals',
      icon: 'DataStore',
      items: [
        { label: 'Intent Ledger', href: '/console/ingestion/intents' },
        { label: 'Raw Envelopes', href: '/console/ingestion/raw-envelopes' },
        { label: 'Batch Pipelines', href: '/console/ingestion/batch-pipelines' },
        { label: 'Stream Consumers', href: '/console/ingestion/stream-consumers' },
      ],
      collapsible: true,
    },
    {
      id: 'validation',
      title: 'Validation & Safety',
      icon: 'Governance',
      items: [
        { label: 'Schema Registry', href: '/console/ingestion/schema-registry' },
        { label: 'Idempotency Store', href: '/console/ingestion/idempotency' },
        { label: 'Pre-ACC Guard', href: '/console/ingestion/pre-acc-guard' },
        { label: 'DLQ (Failures)', href: '/console/ingestion/dlq' },
      ],
      collapsible: true,
    },
    {
      id: 'evidence',
      title: 'Evidence Plane',
      icon: 'Evidence',
      items: [
        { label: 'Evidence Explorer', href: '/console/ingestion/evidence' },
        { label: 'Evidence Integrity', href: '/console/ingestion/evidence/integrity' },
        { label: 'Hash Chain Verifier', href: '/console/ingestion/evidence/hash-verifier' },
      ],
      collapsible: true,
    },
    {
      id: 'operations',
      title: 'Operations',
      icon: 'Operations',
      items: [
        { label: 'Event Graph', href: '/console/ingestion/event-graph' },
        { label: 'Error Monitor', href: '/console/ingestion/error-monitor' },
        { label: 'Outbox Health', href: '/console/ingestion/outbox-health' },
        { label: 'Replay Authorization', href: '/console/ingestion/replay' },
      ],
      collapsible: true,
    },
  ], [])

  const toggleSection = useCallback((id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const isActive = useCallback((href: string) => {
    if (href === '/console/ingestion') {
      return pathname === href
    }
    return pathname === href || pathname?.startsWith(href + '/')
  }, [pathname])

  const renderSection = (section: NavSection) => {
    const IconComponent = Icons[section.icon]
    const isExpanded = !collapsedSections.has(section.id)
    const hasActiveItem = section.items.some(item => isActive(item.href))

    return (
      <div key={section.id} className="mb-1">
        {section.collapsible ? (
          <button
            onClick={() => toggleSection(section.id)}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
              hasActiveItem ? 'text-blue-700 bg-blue-50' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center space-x-2">
              <IconComponent />
              <span className="font-medium">{section.title}</span>
            </div>
            <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
              <Icons.ChevronDown />
            </span>
          </button>
        ) : (
          <div className="px-3 py-2 text-sm text-gray-700 flex items-center space-x-2">
            <IconComponent />
            <span className="font-medium">{section.title}</span>
          </div>
        )}
        
        {isExpanded && (
          <div className="mt-1 ml-4 space-y-0.5">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isActive(item.href)
                    ? 'text-blue-700 bg-blue-50 font-medium'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                • {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-12 px-4 flex items-center border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs font-bold text-gray-900 tracking-wide uppercase">
            Ops Ingestion
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {/* ZORD • INTERNAL OPS Section */}
        <div className="mb-4">
          <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            ZORD • INTERNAL OPS
          </div>
          <div className="h-px bg-gray-200 mx-3 mb-2" />
          {opsNavigation.map(renderSection)}
        </div>

        {/* ZORD • INGESTION Section */}
        <div>
          <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            ZORD • INGESTION
          </div>
          <div className="h-px bg-gray-200 mx-3 mb-2" />
          {ingestionNavigation.map(renderSection)}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
              PROD
            </span>
            <span className="text-[10px] text-gray-400 font-mono">v1.4.3</span>
          </div>
          <span className="text-[10px] text-gray-400">Arealis SSO</span>
        </div>
      </div>
    </aside>
  )
}
