'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'

export default function EventGraphPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/ops/login')
      return
    }
    const user = getCurrentUser()
    if (user && !canAccessDLQ(user.role)) {
      router.push('/ops/login')
      return
    }
    setLoading(false)
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RoleSwitcher />
      <div className="mb-4">
        <Link href="/ops/tenants" className="text-sm text-gray-500 hover:text-gray-700">Event Spine</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">Event Graph</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Event Spine ▸ Event Graph</h1>
        <p className="mt-2 text-sm text-gray-600">
          Visualise lineage from event_edges: envelope → intent → contract and replay relationships.
        </p>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search intent_abc123"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>

      <div className="flex gap-6">
        <div className="flex-1 bg-white border border-gray-200 rounded-lg p-8 min-h-[400px]">
          <div className="text-center text-gray-500 mb-4">[Graph Canvas]</div>
          <div className="font-mono text-sm space-y-2 text-gray-700">
            <div>env_9f3a...</div>
            <div className="pl-4">│ DERIVED_FROM</div>
            <div className="pl-4">▼</div>
            <div>intent_abc123</div>
            <div className="pl-4">│ DERIVED_FROM</div>
            <div className="pl-4">▼</div>
            <div>ctr_777</div>
            <div className="pl-4">▲</div>
            <div className="pl-4">│ CONFIRMS</div>
            <div>bank_settlement_event_xyz</div>
          </div>
        </div>
        <div className="w-64 bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Edge list</h3>
          <ul className="text-xs font-mono space-y-1 text-gray-600">
            <li>env_9f3a... --DERIVED_FROM--&gt; intent_abc123</li>
            <li>intent_abc123 --DERIVED_FROM--&gt; ctr_777</li>
            <li>bank_event_xyz --CONFIRMS--&gt; ctr_777</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
