'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'

export default function EnvelopeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const envelopeId = params.envelope_id as string
  const [activeTab, setActiveTab] = useState<'metadata' | 'payload' | 'intent' | 'dlq' | 'replay'>('metadata')
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

  const tabs = [
    { id: 'metadata' as const, label: 'Metadata' },
    { id: 'payload' as const, label: 'Raw Payload' },
    { id: 'intent' as const, label: 'Linked Intent' },
    { id: 'dlq' as const, label: 'DLQ Records' },
    { id: 'replay' as const, label: 'Replay' },
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
        <Link href="/ops/ingress/envelopes" className="text-sm text-gray-500 hover:text-gray-700">Envelopes</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">env_{envelopeId}</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Ingress ▸ Envelopes ▸ env_{envelopeId}</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Envelope Summary</h2>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Envelope ID:</span>
            <span className="font-mono">env_{envelopeId}</span>
            <button className="text-blue-600 hover:text-blue-800 text-xs">[Copy]</button>
          </div>
          <div><span className="text-gray-500">Tenant:</span> Acme NBFC</div>
          <div><span className="text-gray-500">Source:</span> api (erp)</div>
          <div><span className="text-gray-500">Received At:</span> 2026-02-04T10:05:33Z</div>
          <div><span className="text-gray-500">Parse Status:</span> OK</div>
          <div><span className="text-gray-500">Signature:</span> VERIFIED (provider: razorpay)</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Content Hash:</span>
            <span className="font-mono">4f8a… (SHA-256)</span>
            <button className="text-blue-600 hover:text-blue-800 text-xs">[Copy]</button>
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

      {activeTab === 'metadata' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm">
          <p>Object store key: s3://zord/env/20/26/…/env_{envelopeId}</p>
          <p>Payload size: 3.2 KB</p>
          <p>Content type: application/json</p>
        </div>
      )}
      {activeTab === 'payload' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <pre className="text-sm font-mono bg-gray-50 p-4 rounded overflow-x-auto">
{`{
  "merchant_reference": "ORD-1234",
  "amount": 500000,
  ...
}`}
          </pre>
          <div className="mt-4 flex gap-2">
            <button className="px-4 py-2 bg-gray-100 rounded text-sm hover:bg-gray-200">Copy JSON</button>
            <button className="px-4 py-2 bg-gray-100 rounded text-sm hover:bg-gray-200">Download JSON</button>
          </div>
        </div>
      )}
      {activeTab === 'intent' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm">
          <p>Canonical Intent: <Link href="/ops/intents/intent_abc123" className="text-blue-600 hover:text-blue-800">intent_abc123</Link> [Open in Intents ▸ Canonical Intents]</p>
        </div>
      )}
      {activeTab === 'dlq' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-sm text-gray-500">
          No DLQ records referencing this envelope.
        </div>
      )}
      {activeTab === 'replay' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <Link href={`/ops/system/replay?envelope=env_${envelopeId}`} className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Replay from Envelope
          </Link>
        </div>
      )}
    </div>
  )
}
