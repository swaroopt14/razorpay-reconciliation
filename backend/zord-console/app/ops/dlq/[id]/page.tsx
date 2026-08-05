'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'

export default function DLQDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [activeTab, setActiveTab] = useState<'error' | 'payload' | 'fix' | 'history'>('error')
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

  const replayable = false
  const tabs = [
    { id: 'error' as const, label: 'Error' },
    { id: 'payload' as const, label: 'Raw Payload' },
    { id: 'fix' as const, label: 'Fix Hint' },
    { id: 'history' as const, label: 'Replay History' },
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
        <Link href="/ops/dlq" className="text-sm text-gray-500 hover:text-gray-700">Exceptions</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <Link href="/ops/dlq" className="text-sm text-gray-500 hover:text-gray-700">DLQ</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">{id}</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Exceptions ▸ DLQ ▸ {id}</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          <div>DLQ ID: {id}</div>
          <div>Stage: SEMANTIC_VALIDATION</div>
          <div>Reason Code: SEMANTIC_INVALID</div>
          <div>Created At: 2026-02-04T10:05…</div>
          <div>Replayable: <span className={replayable ? 'text-green-600' : 'text-red-600'}>{replayable ? 'true' : 'false'}</span></div>
          <div>
            Envelope: <Link href="/ops/ingress/envelopes/env_7a10" className="text-blue-600 hover:text-blue-800">env_7a10...</Link> [Open Envelope]
          </div>
          <div>
            Intent: <Link href="/ops/intents/intent_def456" className="text-blue-600 hover:text-blue-800">intent_def456</Link> [Open Intent]
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-4">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 text-sm font-medium ${
                activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'error' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-700">error_detail:</p>
          <pre className="mt-2 p-4 bg-red-50 rounded text-sm text-red-800">&quot;amount must be greater than zero&quot;</pre>
        </div>
      )}
      {activeTab === 'payload' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <pre className="text-sm font-mono bg-gray-50 p-4 rounded overflow-x-auto">
{`{
  "merchant_reference": "ORD-1234",
  "amount": -100,
  ...
}`}
          </pre>
        </div>
      )}
      {activeTab === 'fix' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-700">
            For SEMANTIC_INVALID/AMOUNT_NEGATIVE →<br />
            &quot;Check upstream for negative amount; correct and resend with a new envelope.&quot;
          </p>
        </div>
      )}
      {activeTab === 'history' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          No replays have been run for this item.
        </div>
      )}

      <div className="mt-6">
        {replayable ? (
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Replay</button>
        ) : (
          <button disabled className="px-4 py-2 bg-gray-100 text-gray-400 rounded cursor-not-allowed text-sm" title="Not replayable: SEMANTIC_INVALID">
            Replay (disabled)
          </button>
        )}
      </div>
    </div>
  )
}
