'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'

export default function AuditPage() {
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
    { time: '2026-02-04T10:06Z', actor: 'yash@...', role: 'TENANT_OPS', action: 'DLQ_REPLAY', object: 'dlq_1002' },
    { time: '2026-02-04T10:05Z', actor: 'yash@...', role: 'TENANT_OPS', action: 'INTENT_VIEW', object: 'intent_abc123' },
    { time: '2026-02-04T10:04Z', actor: 'ops@acme', role: 'TENANT_OPS', action: 'ENVELOPE_VIEW', object: 'env_7a10...' },
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
        <Link href="/ops/tenants" className="text-sm text-gray-500 hover:text-gray-700">System</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">Audit</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">System ▸ Audit</h1>
        <p className="mt-2 text-sm text-gray-600">
          Ops view into who did what in this console. Backed by audit_events.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Actor ▾</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Action ▾</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Time range</select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Object</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {events.map((e, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{e.time}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{e.actor}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{e.role}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{e.action}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{e.object}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-gray-200 text-sm text-gray-500">Pagination</div>
      </div>
    </div>
  )
}
