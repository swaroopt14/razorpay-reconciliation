'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Icon components for production-level clarity
const Icons = {
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
  Reliability: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  Observability: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
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
  DataStore: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  Collapse: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
    </svg>
  ),
  Expand: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
}

interface SidebarItem {
  label: string
  href: string
  indent?: boolean
}

interface SidebarSection {
  id: string
  title: string
  icon: keyof typeof Icons
  items: SidebarItem[]
  collapsible?: boolean
}

interface SidebarProps {
  serviceName?: string
}

export function Sidebar({ serviceName = 'Ops Ingestion' }: SidebarProps) {
  const pathname = usePathname()
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [isCollapsed, setIsCollapsed] = useState(false)

  const navigation: SidebarSection[] = useMemo(() => [
    {
      id: 'spine',
      title: 'Ingestion Spine',
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
      id: 'reliability',
      title: 'Reliability',
      icon: 'Reliability',
      items: [
        { label: 'DLQ (Failures)', href: '/console/ingestion/dlq' },
        { label: 'Outbox Health', href: '/console/ingestion/outbox-health' },
      ],
      collapsible: true,
    },
    {
      id: 'observability',
      title: 'Observability',
      icon: 'Observability',
      items: [
        { label: 'Event Graph', href: '/console/ingestion/event-graph' },
        { label: 'Error Monitor', href: '/console/ingestion/error-monitor' },
      ],
      collapsible: true,
    },
    {
      id: 'governance',
      title: 'Governance',
      icon: 'Governance',
      items: [
        { label: 'Schema Registry', href: '/console/ingestion/schema-registry' },
        { label: 'Evolution Monitor', href: '/console/ingestion/schema-registry/evolution', indent: true },
        { label: 'Idempotency Store', href: '/console/ingestion/idempotency' },
        { label: 'Pre-ACC Guard', href: '/console/ingestion/pre-acc-guard' },
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
      id: 'datastores',
      title: 'Data Stores',
      icon: 'DataStore',
      items: [
        { label: 'Intent Ledger', href: '/console/ingestion/intents' },
        { label: 'Raw Envelopes', href: '/console/ingestion/raw-envelopes' },
        { label: 'Batch Pipelines', href: '/console/ingestion/batch-pipelines' },
        { label: 'Stream Consumers', href: '/console/ingestion/stream-consumers' },
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
    return pathname?.startsWith(href)
  }, [pathname])

  const isSectionActive = useCallback((section: SidebarSection) => {
    return section.items.some(item => isActive(item.href))
  }, [isActive])

  // Collapsed sidebar view
  if (isCollapsed) {
    return (
      <aside 
        className="w-16 bg-white border-r border-gray-200 h-[calc(100vh-4rem)] flex flex-col transition-all duration-200"
        aria-label="Sidebar navigation collapsed"
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-center border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Expand sidebar"
          >
            <Icons.Expand />
          </button>
        </div>

        {/* Collapsed icons */}
        <nav className="flex-1 py-3 space-y-1">
          {navigation.map((section) => {
            const IconComponent = Icons[section.icon]
            const active = isSectionActive(section)
            return (
              <div key={section.id} className="px-3">
                <Link
                  href={section.items[0].href}
                  className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                    active 
                      ? 'bg-blue-50 text-blue-600' 
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                  title={section.title}
                  aria-label={section.title}
                >
                  <IconComponent />
                </Link>
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-gray-200">
          <div className="flex items-center justify-center">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
              PROD
            </span>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside 
      className="w-64 bg-white border-r border-gray-200 h-[calc(100vh-4rem)] flex flex-col transition-all duration-200"
      aria-label="Sidebar navigation"
    >
      {/* Service Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Service healthy" />
          <div>
            <h1 className="text-xs font-bold text-gray-900 tracking-wide uppercase">
              Zord · {serviceName}
            </h1>
          </div>
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Collapse sidebar"
        >
          <Icons.Collapse />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2" role="navigation">
        {navigation.map((section, idx) => {
          const IconComponent = Icons[section.icon]
          const isExpanded = !collapsedSections.has(section.id)
          const sectionActive = isSectionActive(section)
          
          return (
            <div key={section.id} className={idx > 0 ? 'mt-1' : ''}>
              {/* Section Header */}
              <button
                onClick={() => section.collapsible && toggleSection(section.id)}
                className={`w-full px-3 py-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider transition-colors ${
                  sectionActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
                } ${section.collapsible ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'}`}
                aria-expanded={isExpanded}
                aria-controls={`section-${section.id}`}
                disabled={!section.collapsible}
              >
                <div className="flex items-center space-x-2">
                  <span className={sectionActive ? 'text-blue-500' : 'text-gray-400'}>
                    <IconComponent />
                  </span>
                  <span>{section.title}</span>
                </div>
                {section.collapsible && (
                  <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                    <Icons.ChevronRight />
                  </span>
                )}
              </button>

              {/* Section Items */}
              <div 
                id={`section-${section.id}`}
                className={`overflow-hidden transition-all duration-200 ${
                  isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="py-1">
                  {section.items.map((item) => {
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`group flex items-center pl-${item.indent ? '11' : '9'} pr-3 py-2 text-sm transition-all duration-150 relative ${
                          active
                            ? 'text-blue-600 bg-blue-50 font-medium'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                        aria-current={active ? 'page' : undefined}
                      >
                        {/* Active indicator */}
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-600 rounded-r" />
                        )}
                        <span className={`truncate ${item.indent ? 'pl-2' : ''}`}>
                          {item.indent && <span className="text-gray-300 mr-1.5">└</span>}
                          {item.label}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
                PROD
              </span>
              <span className="text-[10px] text-gray-400 font-mono">v1.4.3</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              Internal Control Plane
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400">
              Arealis SSO
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
