'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'

export default function IdempotencyPage() {
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

  const keys = [
    { idempotency_key: 'idemp-ORD-1234', first_envelope_id: 'env_9f3a...', canonical_intent_id: 'intent_abc123', status: 'TERMINAL' },
    { idempotency_key: 'idemp-ORD-1234-RETRY', first_envelope_id: 'env_28bd...', canonical_intent_id: 'intent_abc123', status: 'TERMINAL' },
    { idempotency_key: 'idemp-UPI-5678', first_envelope_id: 'env_7a10...', canonical_intent_id: null, status: 'IN_PROGRESS' },
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
        <Link href="/ops/tenants" className="text-sm text-gray-500 hover:text-gray-700">Ingress</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">Idempotency</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Ingress ▸ Idempotency</h1>
        <p className="mt-2 text-sm text-gray-600">
          Was this a duplicate? What response did client see originally? Critical for disputes.
        </p>
      </div>

      <div className="mb-4 flex gap-4">
        <input
          type="text"
          placeholder="Search idempotency key / envelope / intent"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <select className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option value="">Status ▾</option>
          <option value="TERMINAL">TERMINAL</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Idempotency Key</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">First Envelope</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intent ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {keys.map((k) => (
              <tr key={k.idempotency_key} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">{k.idempotency_key}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{k.first_envelope_id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{k.canonical_intent_id ?? 'NULL'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${k.status === 'TERMINAL' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {k.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <Link href={`/ops/ingress/idempotency/${encodeURIComponent(k.idempotency_key)}`} className="text-blue-600 hover:text-blue-800">
                    View →
                  </Link>
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
