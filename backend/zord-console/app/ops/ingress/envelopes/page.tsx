'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'
import { format } from 'date-fns'

export default function IngressEnvelopesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  const [envelopes, setEnvelopes] = useState<any[]>([])

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
    loadEnvelopes()
  }, [router])

  const loadEnvelopes = async () => {
    try {
      const res = await fetch('/api/prod/raw-envelopes')
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setEnvelopes(data.items || [])
    } catch (err) {
      console.error('Failed to load envelopes:', err)
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
        <Link href="/ops/tenants" className="text-sm text-gray-500 hover:text-gray-700">Ingress</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">Envelopes</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Ingress ▸ Envelopes</h1>
        <p className="mt-2 text-sm text-gray-600">
          First stop when something broke at ingestion. Did we receive it? How? What did we ACK?
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option>Time range ▾</option>
        </select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option>Source ▾</option>
        </select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option>Source System ▾</option>
        </select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option>Parse Status ▾</option>
        </select>
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option>Signature ▾</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Envelope ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source System</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parse Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Received At</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {envelopes.map((e: any) => (
              <tr key={e.envelope_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">{e.envelope_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{e.source_system || e.source || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{e.tenant_id ? e.tenant_id.substring(0, 8) + '...' : '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${e.parse_status === 'ACCEPTED' || e.parse_status === 'OK' ? 'bg-green-100 text-green-800' : e.parse_status === 'RECEIVED' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                    {e.parse_status || '-'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(e.received_at), 'yyyy-MM-dd HH:mm')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <Link href={`/ops/ingress/envelopes/${e.envelope_id}`} className="text-blue-600 hover:text-blue-800">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
            {envelopes.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">No envelopes found</td></tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-gray-200 text-sm text-gray-500">Showing {envelopes.length} envelopes</div>
      </div>
    </div>
  )
}
