'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'
import { format } from 'date-fns'

export default function DLQPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [items, setItems] = useState<any[]>([])

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
    loadDLQ()
  }, [router])

  const loadDLQ = async () => {
    try {
      const res = await fetch('/api/prod/dlq')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setItems(data.items || [])
    } catch (err) {
      console.error('Failed to load DLQ:', err)
    } finally {
      setLoading(false)
    }
  }

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
        <Link href="/ops/tenants" className="text-sm text-gray-500 hover:text-gray-700">Exceptions</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">Dead Letter Queue</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Exceptions ▸ Dead Letter Queue</h1>
        <p className="mt-2 text-sm text-gray-600">
          Most important page for failure handling. Direct UI over dlq_items.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Stage ▾</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Replayable ▾</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Time range</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Tenant (internal ops)</select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DLQ ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stage</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Replayable</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Envelope</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item: any) => (
              <tr key={item.dlq_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">{item.dlq_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.stage}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.reason_code}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${item.replayable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {item.replayable ? 'true' : 'false'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{item.envelope_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(item.created_at), 'yyyy-MM-dd HH:mm')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <Link href={`/ops/dlq/${item.dlq_id}`} className="text-blue-600 hover:text-blue-800">View →</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">No DLQ items found</td></tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-gray-200 text-sm text-gray-500">Showing {items.length} DLQ items</div>
      </div>
    </div>
  )
}
