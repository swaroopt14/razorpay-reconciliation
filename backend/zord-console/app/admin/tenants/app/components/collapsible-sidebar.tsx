'use client'

import { useState } from "react"
import React from 'react'
import Link from 'next/link'
import { ChevronDown, Menu, X, Home, BookOpen, LogOut, Settings, BarChart3, Search, MoreVertical, FileText, GitBranch, MessageSquare, AlertCircle, Landmark } from 'lucide-react'
import clsx from 'clsx'
import { useSidebar } from '@/app/context/sidebar-context'
import { PAYOUT_VIEW_URLS } from '@/services/payout-command/model'

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  href: string
  badge?: string | number
}

interface NavSection {
  title: string
  items: NavItem[]
  collapsible?: boolean
  defaultOpen?: boolean
}

const navSections: NavSection[] = [
  {
    title: 'Setup',
    items: [
      { id: 'setup', label: 'Onboarding & Setup', icon: <Home className="w-4 h-4" />, href: '/dashboard' },
    ],
  },
  {
    title: 'Core Operations',
    items: [
      {
        id: 'intent-journal',
        label: 'Intent Journal',
        icon: <BookOpen className="w-4 h-4" />,
        href: `${PAYOUT_VIEW_URLS.liveConsole}?dock=grid`,
      },
      {
        id: 'settlement-journal',
        label: 'Settlement Journal',
        icon: <Landmark className="w-4 h-4" />,
        href: `${PAYOUT_VIEW_URLS.liveConsole}?dock=settlement`,
      },
      { id: 'dlq', label: 'Dead Letter Queue', icon: <AlertCircle className="w-4 h-4" />, href: '/dlq' },
      { id: 'schema-contracts', label: 'Schema & Contracts', icon: <FileText className="w-4 h-4" />, href: '/schema' },
      { id: 'replay-evidence', label: 'Replay & Evidence', icon: <GitBranch className="w-4 h-4" />, href: '/replay' },
      { id: 'event-timeline', label: 'Event Graph Timeline', icon: <BarChart3 className="w-4 h-4" />, href: '/timeline' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'api-logs', label: 'API Logs & Callbacks', icon: <Search className="w-4 h-4" />, href: '/logs' },
      { id: 'copilot', label: 'AI Copilot', icon: <MessageSquare className="w-4 h-4" />, href: '/copilot' },
    ],
  },
  {
    title: 'Admin',
    items: [
      {
        id: 'settings',
        label: 'Settings & Audit Logs',
        icon: <Settings className="w-4 h-4" />,
        href: PAYOUT_VIEW_URLS.settingsAccount,
      },
      { id: 'logout', label: 'Log out', icon: <LogOut className="w-4 h-4" />, href: '/' },
    ],
  },
]

const CollapsibleSidebarComponent = () => {
  const { isOpen, setIsOpen } = useSidebar()
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({
    'Setup': true,
    'Core Operations': true,
    'Operations': false,
    'Admin': false,
  })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  return (
    <>
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed left-0 top-0 h-screen bg-[#1a1a1a] border-r border-gray-700/50 transition-all duration-300 z-50 flex flex-col',
          isOpen ? 'w-64' : 'w-20'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700/50">
          {isOpen && <h1 className="text-sm font-bold text-white tracking-wide">ZORD VAULT</h1>}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 hover:bg-gray-700/50 rounded-lg transition text-gray-400 hover:text-white"
            aria-label="Toggle sidebar"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Search */}
        {isOpen && (
          <div className="px-3 py-3 border-b border-gray-700/50">
            <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search..."
                className="flex-1 bg-transparent text-xs text-white placeholder:text-gray-500 outline-none"
              />
            </div>
          </div>
        )}

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-2">
          {navSections.map((section) => (
            <div key={section.title}>
              {/* Section Header */}
              {section.collapsible ? (
                <button
                  onClick={() => toggleSection(section.title)}
                  className={clsx(
                    'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-gray-200 transition',
                    !isOpen && 'justify-center'
                  )}
                >
                  {isOpen && <span>{section.title}</span>}
                  {isOpen && (
                    <ChevronDown
                      className={clsx(
                        'w-4 h-4 transition-transform',
                        expandedSections[section.title] ? 'rotate-0' : '-rotate-90'
                      )}
                    />
                  )}
                </button>
              ) : (
                isOpen && <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">{section.title}</div>
              )}

              {/* Section Items */}
              <div
                className={clsx(
                  'space-y-1 overflow-hidden transition-all',
                  section.collapsible && !expandedSections[section.title] ? 'hidden' : ''
                )}
              >
                {section.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={clsx(
                      'flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-gray-700/50 transition',
                      !isOpen && 'justify-center px-2'
                    )}
                    title={!isOpen ? item.label : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-gray-500 hover:text-gray-300 flex-shrink-0 transition-colors">{item.icon}</span>
                      {isOpen && <span className="truncate">{item.label}</span>}
                    </div>
                    {isOpen && item.badge && (
                      <span className="ml-auto text-xs bg-gray-700/50 text-gray-300 px-2 py-0.5 rounded flex-shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer - User Info */}
        <div className="border-t border-gray-700/50 p-3">
          <div className={clsx('flex items-center gap-3', !isOpen && 'justify-center')}>
            <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">LS</span>
            </div>
            {isOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">Liam Smith</p>
                <p className="text-xs text-gray-400 truncate">smith@example.com</p>
              </div>
            )}
            {isOpen && (
              <button className="p-1 hover:bg-gray-700/50 rounded transition text-gray-400 hover:text-white flex-shrink-0">
                <MoreVertical className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}

export function CollapsibleSidebar() {
  return <CollapsibleSidebarComponent />
}

export default CollapsibleSidebar
