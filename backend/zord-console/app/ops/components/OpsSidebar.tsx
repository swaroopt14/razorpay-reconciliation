'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  label: string
  href: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navigation: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Tenants', href: '/ops/tenants' }],
  },
  {
    title: 'Ingress',
    items: [
      { label: 'Envelopes', href: '/ops/ingress/envelopes' },
      { label: 'Idempotency', href: '/ops/ingress/idempotency' },
    ],
  },
  {
    title: 'Intents',
    items: [
      { label: 'Canonical Intents', href: '/ops/intents' },
    ],
  },
  {
    title: 'Contracts',
    items: [{ label: 'Payout Contracts', href: '/ops/contracts' }],
  },
  {
    title: 'Event Spine',
    items: [
      { label: 'Outbox', href: '/ops/events/outbox' },
      { label: 'Event Graph', href: '/ops/events/graph' },
    ],
  },
  {
    title: 'Exceptions',
    items: [{ label: 'Dead Letter Queue', href: '/ops/dlq' }],
  },
  {
    title: 'System',
    items: [
      { label: 'Replay', href: '/ops/system/replay' },
      { label: 'Audit', href: '/ops/system/audit' },
    ],
  },
]

export function OpsSidebar() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/ops/tenants') return pathname === href
    return pathname?.startsWith(href)
  }

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-[calc(100vh-4rem)] overflow-y-auto flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h1 className="text-xs font-bold text-gray-900 tracking-wide">ZORD • CUSTOMER OPS</h1>
        <div className="mt-1.5 h-px bg-gray-300 w-10" />
      </div>
      <nav className="flex-1 py-2">
        {navigation.map((section) => (
          <div key={section.title} className="mb-1">
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-2 text-sm transition-colors ${
                    active ? 'bg-blue-600 text-white font-medium' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
          Tenant-scoped
        </div>
        <div className="text-xs text-gray-600 leading-tight">
          Read-only ops view
          <br />
          Customer Ops Console
        </div>
      </div>
    </div>
  )
}
