'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getCurrentRole, logout } from '@/services/auth'
import { UserRole } from '@/types/auth'
import { ZordLogo } from '@/components/ZordLogo'

type Environment = 'sandbox' | 'production'
type RoleBadge = 'Read' | 'Operator' | 'Admin'

interface TopBarProps {
  tenant?: string
  onTenantChange?: (tenant: string) => void
  environment?: Environment
  onEnvironmentChange?: (env: Environment) => void
  serviceName?: string
  breadcrumbs?: string[]
}

interface Notification {
  id: string
  type: 'failure' | 'sla_breach' | 'webhook_deadletter' | 'incident'
  title: string
  description: string
  time: string
  read: boolean
  href?: string
}

// Mock notifications
const mockNotifications: Notification[] = [
  { id: '1', type: 'incident', title: 'Active Incident', description: 'Webhook delivery stalled - 3 tenants affected', time: '2m ago', read: false, href: '/console/dashboards/incidents' },
  { id: '2', type: 'failure', title: 'DLQ Spike', description: '47 new DLQ items in last hour', time: '14m ago', read: false, href: '/console/ingestion/dlq' },
  { id: '3', type: 'sla_breach', title: 'SLA Warning', description: 'P95 latency approaching threshold (450ms)', time: '32m ago', read: true, href: '/console/dashboards/platform-health' },
  { id: '4', type: 'webhook_deadletter', title: 'Webhook Failures', description: '12 webhooks moved to dead letter queue', time: '1h ago', read: true, href: '/console/ingestion/webhooks' },
]

// Mock tenants for search
const mockTenants = [
  { id: 't_91af', name: 'AcmePay', status: 'healthy' },
  { id: 't_77bd', name: 'ZenPay', status: 'at_risk' },
  { id: 't_12ac', name: 'NovaBank', status: 'healthy' },
  { id: 't_99dd', name: 'AlphaRetail', status: 'healthy' },
  { id: 't_34ef', name: 'PayCore', status: 'healthy' },
]

function getRoleBadge(role: UserRole): RoleBadge {
  switch (role) {
    case 'CUSTOMER_USER': return 'Read'
    case 'CUSTOMER_ADMIN':
    case 'OPS': return 'Operator'
    case 'ADMIN': return 'Admin'
    default: return 'Read'
  }
}

// Global Search Modal (Cmd+K)
function GlobalSearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'intents' | 'envelopes' | 'contracts' | 'webhooks'>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const searchTypes = [
    { id: 'all', label: 'All' },
    { id: 'intents', label: 'Intents' },
    { id: 'envelopes', label: 'Envelopes' },
    { id: 'contracts', label: 'Contracts' },
    { id: 'webhooks', label: 'Webhooks' },
  ]

  const recentSearches = [
    { type: 'intent', id: 'pi_20260115_91XK', label: 'Intent pi_20260115_91XK' },
    { type: 'envelope', id: 'env_20260113T122911Z_twyh', label: 'Envelope env_20260113...' },
    { type: 'contract', id: 'con_20260114_7A2B', label: 'Contract con_20260114_7A2B' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center px-4 py-3 border-b border-gray-200">
          <svg className="w-5 h-5 text-gray-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search intent_id, envelope_id, contract_id, vendor_ref, provider_ref..."
            className="flex-1 text-base text-gray-900 placeholder-gray-400 outline-none"
          />
          <kbd className="ml-3 px-2 py-1 text-xs font-mono text-gray-400 bg-gray-100 rounded">ESC</kbd>
        </div>

        {/* Search Type Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50">
          {searchTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setActiveTab(type.id as typeof activeTab)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === type.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Results / Recent */}
        <div className="max-h-80 overflow-y-auto">
          {query.length === 0 ? (
            <div className="p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Searches</div>
              {recentSearches.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onClose()
                    router.push(`/console/ingestion/${item.type}s/${item.id}`)
                  }}
                  className="flex items-center w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-mono">{item.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Search Results</div>
              <div className="text-sm text-gray-500 py-8 text-center">
                Press Enter to search for &quot;{query}&quot;
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span><kbd className="px-1.5 py-0.5 bg-white border rounded">Tab</kbd> to navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-white border rounded">Enter</kbd> to select</span>
          </div>
          <span>Powered by Zord Search</span>
        </div>
      </div>
    </div>
  )
}

// Copilot Modal (Ask Zord)
function CopilotModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const suggestions = [
    'Show me tenants with DLQ spikes',
    'What caused the webhook failures today?',
    'Navigate to schema validation errors',
    'Summarize platform health status',
    'Show recent incidents for AcmePay',
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-indigo-600">
          <div className="flex items-center gap-2 text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="font-semibold">Ask Zord</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Input */}
        <div className="p-4">
          <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything about your data..."
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none"
            />
            <button className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Suggestions */}
        <div className="px-4 pb-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Try asking</div>
          <div className="space-y-1">
            {suggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => setQuery(suggestion)}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors text-left"
              >
                <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          Context-aware AI assistant. Never exposes secrets or PII.
        </div>
      </div>
    </div>
  )
}

// Notifications Dropdown
function NotificationsDropdown({ 
  notifications, 
  isOpen, 
  onClose 
}: { 
  notifications: Notification[]
  isOpen: boolean
  onClose: () => void
}) {
  const router = useRouter()
  
  if (!isOpen) return null
  
  const unreadCount = notifications.filter(n => !n.read).length
  
  const typeIcons = {
    incident: (
      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
    ),
    failure: (
      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
    sla_breach: (
      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
    webhook_deadletter: (
      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
        <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
    ),
  }

  return (
    <div className="absolute right-0 top-full mt-1 w-96 bg-white border border-gray-200 rounded-lg shadow-2xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">Notifications</span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium text-white bg-red-500 rounded-full">{unreadCount}</span>
          )}
        </div>
        <button className="text-sm text-blue-600 hover:text-blue-700">Mark all read</button>
      </div>
      
      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.map((notif) => (
          <button
            key={notif.id}
            onClick={() => {
              if (notif.href) router.push(notif.href)
              onClose()
            }}
            className={`flex items-start gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
              !notif.read ? 'bg-blue-50/50' : ''
            }`}
          >
            {typeIcons[notif.type]}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${!notif.read ? 'text-gray-900' : 'text-gray-700'}`}>
                  {notif.title}
                </span>
                <span className="text-xs text-gray-400 ml-2">{notif.time}</span>
              </div>
              <p className="text-sm text-gray-500 truncate mt-0.5">{notif.description}</p>
            </div>
            {!notif.read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />}
          </button>
        ))}
      </div>
      
      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <Link href="/console/notifications" className="text-sm text-blue-600 hover:text-blue-700" onClick={onClose}>
          View all notifications
        </Link>
      </div>
    </div>
  )
}

// User Menu Dropdown
function UserMenuDropdown({ 
  user, 
  role, 
  isOpen, 
  onClose 
}: { 
  user: { email?: string; tenant?: string }
  role: RoleBadge
  isOpen: boolean
  onClose: () => void
}) {
  const router = useRouter()
  
  if (!isOpen) return null

  const handleLogout = () => {
    logout()
    onClose()
    router.push('/console/login')
  }

  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-2xl z-50">
      {/* Profile Section */}
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
            {(user.email?.[0] || 'U').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate">{user.email || 'user@example.com'}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                role === 'Admin' ? 'bg-purple-100 text-purple-700' :
                role === 'Operator' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {role}
              </span>
              <span className="text-xs text-gray-500">{user.tenant || 'default'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="py-2">
        <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Account</div>
        <button className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Profile Settings
        </button>
        <button className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          Security & Access
        </button>
        <button className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Session History
        </button>
      </div>

      <div className="border-t border-gray-200 py-2">
        <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Workspace</div>
        <button className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Switch Tenant
        </button>
        <button className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Preferences
        </button>
      </div>

      {/* Sign Out */}
      <div className="border-t border-gray-200 py-2">
        <button 
          onClick={handleLogout}
          className="flex items-center w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          <svg className="w-4 h-4 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  )
}

export function TopBar({
  tenant,
  onTenantChange,
  environment,
  onEnvironmentChange,
  serviceName = '',
  breadcrumbs = [],
}: TopBarProps) {
  const [currentTenant, setCurrentTenant] = useState(tenant || 'acme-corp')
  const [currentEnv, setCurrentEnv] = useState<Environment>(environment || 'production')
  const [showTenantSearch, setShowTenantSearch] = useState(false)
  const [tenantSearchQuery, setTenantSearchQuery] = useState('')
  const [showServicesMenu, setShowServicesMenu] = useState(false)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [showCopilot, setShowCopilot] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  
  const tenantSearchRef = useRef<HTMLDivElement>(null)
  const servicesMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    setUser(getCurrentUser())
    setRole(getCurrentRole())
  }, [])

  useEffect(() => {
    if (environment) setCurrentEnv(environment)
  }, [environment])

  // Keyboard shortcut for global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowGlobalSearch(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tenantSearchRef.current && !tenantSearchRef.current.contains(e.target as Node)) setShowTenantSearch(false)
      if (servicesMenuRef.current && !servicesMenuRef.current.contains(e.target as Node)) setShowServicesMenu(false)
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) setShowNotifications(false)
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleEnvironmentChange = (env: Environment) => {
    setCurrentEnv(env)
    onEnvironmentChange?.(env)
  }

  const handleTenantSelect = (tenantId: string) => {
    setCurrentTenant(tenantId)
    setShowTenantSearch(false)
    setTenantSearchQuery('')
    onTenantChange?.(tenantId)
  }

  const filteredTenants = mockTenants.filter(t => 
    t.name.toLowerCase().includes(tenantSearchQuery.toLowerCase()) ||
    t.id.toLowerCase().includes(tenantSearchQuery.toLowerCase())
  )

  const unreadNotifications = mockNotifications.filter(n => !n.read).length

  if (!mounted || !user || !role) {
    return (
      <div className="bg-[#232f3e] text-white h-12">
        <div className="flex items-center justify-between h-12 px-4">
          <ZordLogo size="sm" variant="dark" />
        </div>
      </div>
    )
  }

  const roleBadge = getRoleBadge(role)
  const breadcrumbPath = breadcrumbs.length > 0 ? ` > ${breadcrumbs.join(' > ')}` : ''

  return (
    <>
      <div className="bg-[#232f3e] text-white shadow-sm border-b border-gray-700">
        <div className="flex items-center justify-between h-12 px-0">
          {/* Left: Logo, Services, Context Switcher */}
          <div className="flex items-center h-full">
            {/* Logo */}
            <Link href="/console" className="px-4 h-full hover:bg-[#1a2332] flex items-center transition-colors">
              <ZordLogo size="sm" variant="dark" />
            </Link>

            <div className="h-7 w-px bg-gray-600" />

            {/* Services Menu */}
            <div className="relative h-full" ref={servicesMenuRef}>
              <button
                onClick={() => setShowServicesMenu(!showServicesMenu)}
                className={`px-4 h-full flex items-center gap-2 text-sm font-medium transition-colors ${showServicesMenu ? 'bg-[#1a2332]' : 'hover:bg-[#1a2332]'}`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span>Services</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showServicesMenu && (
                <div className="absolute left-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-2xl z-50">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                    <span className="text-sm font-semibold text-gray-900">Services</span>
                  </div>
                  <div className="py-2">
                    <Link href="/console" onClick={() => setShowServicesMenu(false)} className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">
                      <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                      </svg>
                      Console Home
                    </Link>
                    <div className="my-2 mx-4 border-t border-gray-100" />
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase">Dashboards</div>
                    <Link href="/console/dashboards/platform-health" onClick={() => setShowServicesMenu(false)} className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">
                      <span className="w-4 h-4 mr-3" /> Platform Health
                    </Link>
                    <Link href="/console/dashboards/tenant-health" onClick={() => setShowServicesMenu(false)} className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">
                      <span className="w-4 h-4 mr-3" /> Tenant Health
                    </Link>
                    <Link href="/console/dashboards/incidents" onClick={() => setShowServicesMenu(false)} className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">
                      <span className="w-4 h-4 mr-3" /> Incidents
                    </Link>
                    <div className="my-2 mx-4 border-t border-gray-100" />
                    <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase">Services</div>
                    <Link href="/console/ingestion" onClick={() => setShowServicesMenu(false)} className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700">
                      <span className="w-4 h-4 mr-3" /> Ingestion
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div className="h-7 w-px bg-gray-600" />

            {/* Context Switcher: Tenant Search */}
            <div className="relative h-full" ref={tenantSearchRef}>
              <button
                onClick={() => setShowTenantSearch(!showTenantSearch)}
                className={`px-4 h-full flex items-center gap-2 text-sm transition-colors ${showTenantSearch ? 'bg-[#1a2332]' : 'hover:bg-[#1a2332]'}`}
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="text-gray-300">Tenant:</span>
                <span className="font-medium">{mockTenants.find(t => t.id === currentTenant)?.name || currentTenant}</span>
                <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showTenantSearch && (
                <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-2xl z-50">
                  <div className="p-3 border-b border-gray-200">
                    <input
                      type="text"
                      value={tenantSearchQuery}
                      onChange={(e) => setTenantSearchQuery(e.target.value)}
                      placeholder="Search tenants..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {filteredTenants.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleTenantSelect(t.id)}
                        className={`flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                          currentTenant === t.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        <span className="font-medium">{t.name}</span>
                        <span className={`w-2 h-2 rounded-full ${t.status === 'healthy' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="h-7 w-px bg-gray-600" />

            {/* Environment Toggle */}
            <div className="flex items-center px-2 h-full">
              <div className="flex items-center bg-[#1a2332] rounded-lg p-0.5">
                <button
                  onClick={() => handleEnvironmentChange('production')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    currentEnv === 'production' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  PROD
                </button>
                <button
                  onClick={() => handleEnvironmentChange('sandbox')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    currentEnv === 'sandbox' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  SANDBOX
                </button>
              </div>
            </div>

            {/* Service Name & Breadcrumbs */}
            {serviceName && (
              <>
                <div className="h-7 w-px bg-gray-600 ml-2" />
                <div className="ml-4 flex items-center">
                  <span className="text-sm font-medium text-white">{serviceName}</span>
                  {breadcrumbPath && <span className="ml-2 text-xs text-gray-400">{breadcrumbPath}</span>}
                </div>
              </>
            )}
          </div>

          {/* Center: Global Search */}
          <div className="flex-1 flex justify-center max-w-lg mx-4">
            <button
              onClick={() => setShowGlobalSearch(true)}
              className="w-full flex items-center justify-between px-4 py-1.5 bg-[#1a2332] border border-gray-600 rounded-lg text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Search intents, envelopes, contracts...</span>
              </div>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-700 rounded">Cmd+K</kbd>
            </button>
          </div>

          {/* Right: Copilot, Notifications, User Menu */}
          <div className="flex items-center h-full">
            {/* Copilot Button */}
            <button
              onClick={() => setShowCopilot(true)}
              className="px-3 h-full flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-[#1a2332] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span>Ask Zord</span>
            </button>

            <div className="h-7 w-px bg-gray-600" />

            {/* Notifications */}
            <div className="relative h-full" ref={notificationsRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={`px-3 h-full flex items-center text-gray-300 hover:text-white transition-colors relative ${showNotifications ? 'bg-[#1a2332] text-white' : 'hover:bg-[#1a2332]'}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadNotifications > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
              <NotificationsDropdown 
                notifications={mockNotifications} 
                isOpen={showNotifications} 
                onClose={() => setShowNotifications(false)} 
              />
            </div>

            <div className="h-7 w-px bg-gray-600" />

            {/* User Menu */}
            <div className="relative h-full" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className={`px-4 h-full flex items-center gap-2 text-sm transition-colors ${showUserMenu ? 'bg-[#1a2332]' : 'hover:bg-[#1a2332]'}`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-semibold text-white">
                  {(user.email?.[0] || 'U').toUpperCase()}
                </div>
                <span className="text-gray-300 max-w-[150px] truncate">{user.email || 'user@example.com'}</span>
                <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <UserMenuDropdown 
                user={user} 
                role={roleBadge} 
                isOpen={showUserMenu} 
                onClose={() => setShowUserMenu(false)} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Global Search Modal */}
      <GlobalSearchModal isOpen={showGlobalSearch} onClose={() => setShowGlobalSearch(false)} />

      {/* Copilot Modal */}
      <CopilotModal isOpen={showCopilot} onClose={() => setShowCopilot(false)} />
    </>
  )
}
