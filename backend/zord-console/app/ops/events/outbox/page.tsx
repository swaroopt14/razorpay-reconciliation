'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'
import { format } from 'date-fns'

export default function OutboxPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

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

  const events = [
    { event_type: 'intent.created.v1', status: 'PENDING', attempts: 0, next_attempt_at: '2026-02-04T10:05:00Z', aggregate_id: 'intent_abc123' },
    { event_type: 'envelope.stored.v1', status: 'FAILED', attempts: 3, next_attempt_at: '2026-02-04T10:06:00Z', aggregate_id: 'env_7a10...' },
  ]

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
        <span className="text-sm font-medium text-gray-900">Outbox</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Event Spine ▸ Outbox</h1>
        <p className="mt-2 text-sm text-gray-600">
          DB committed but Kafka not yet published. Close the gap.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">123</div>
          <div className="text-sm text-gray-500">Pending</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-600">5</div>
          <div className="text-sm text-gray-500">Failed</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">1.2s</div>
          <div className="text-sm text-gray-500">Median publish delay</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Event Type ▾</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Status ▾</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Time range</select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attempts</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Attempt At</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aggregate</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {events.map((e, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{e.event_type}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${e.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                    {e.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{e.attempts}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(e.next_attempt_at), 'yyyy-MM-dd HH:mm')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{e.aggregate_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <Link href={`/ops/intents/${e.aggregate_id}`} className="text-blue-600 hover:text-blue-800">View →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-gray-200 text-sm text-gray-500">Pagination</div>
      </div>
    </div>
  )
}
