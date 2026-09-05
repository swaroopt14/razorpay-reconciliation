'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'
import { format } from 'date-fns'

export default function IntentsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [intents, setIntents] = useState<any[]>([])

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
    loadIntents()
  }, [router])

  const loadIntents = async () => {
    try {
      const res = await fetch('/api/prod/intents')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setIntents(data.items || [])
    } catch (err) {
      console.error('Failed to load intents:', err)
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

  const statusColors: Record<string, string> = {
    DONE: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
    PROCESSING: 'bg-amber-100 text-amber-800',
    RECEIVED: 'bg-blue-100 text-blue-800',
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RoleSwitcher />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Intents ▸ Canonical Intents</h1>
        <p className="mt-2 text-sm text-gray-600">
          Primary Intent Journal for ops, backed by payment_intents.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Time range</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Type ▾</select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Status ▾</select>
        <input type="text" placeholder="Min amount" className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
        <input type="text" placeholder="Max amount" className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm" />
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">Provider ▾</select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intent ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Confidence</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {intents.map((i: any) => (
              <tr key={i.intent_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">{i.intent_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{i.intent_type || i.source || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{typeof i.amount === 'number' ? i.amount.toLocaleString() : i.amount || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{i.currency || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${statusColors[i.status] ?? 'bg-gray-100 text-gray-800'}`}>
                    {i.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{i.confidence_score || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(i.created_at), 'yyyy-MM-dd HH:mm')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <Link href={`/ops/intents/${i.intent_id}`} className="text-blue-600 hover:text-blue-800">View →</Link>
                </td>
              </tr>
            ))}
            {intents.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-gray-500">No intents found</td></tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-gray-200 text-sm text-gray-500">Showing {intents.length} intents</div>
      </div>
    </div>
  )
}
