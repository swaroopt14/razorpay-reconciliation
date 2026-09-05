'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'

export default function IdempotencyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
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

  const status = 'TERMINAL'

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
        <Link href="/ops/ingress/idempotency" className="text-sm text-gray-500 hover:text-gray-700">Idempotency</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">{id}</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Ingress ▸ Idempotency ▸ {id}</h1>
      </div>

      {status === 'TERMINAL' && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Idempotent response; this is exactly what the client received.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Idempotency Key:</span>
            <span className="font-mono">{id}</span>
            <button className="text-blue-600 hover:text-blue-800 text-xs">[Copy]</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span>
            <span className={`px-2 py-1 text-xs font-medium rounded ${status === 'TERMINAL' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {status}
            </span>
          </div>
          <div>
            <span className="text-gray-500">First Envelope:</span>{' '}
            <Link href="/ops/ingress/envelopes/env_9f3a" className="text-blue-600 hover:text-blue-800">env_9f3a...</Link>{' '}
            [Open Envelope]
          </div>
          <div>
            <span className="text-gray-500">Intent:</span>{' '}
            <Link href="/ops/intents/intent_abc123" className="text-blue-600 hover:text-blue-800">intent_abc123</Link>{' '}
            [Open Intent]
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Response Snapshot</h2>
          {status === 'TERMINAL' && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Frozen audit record</span>
          )}
        </div>
        <div className="px-6 py-4">
          <pre className="text-sm font-mono bg-gray-50 p-4 rounded overflow-x-auto">
{`{
  "http_status": 200,
  "body": { "intent_id": "intent_abc123", ... },
  "headers": { ... }
}`}
          </pre>
        </div>
      </div>
    </div>
  )
}
