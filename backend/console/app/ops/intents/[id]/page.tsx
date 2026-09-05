'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'

export default function IntentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [activeTab, setActiveTab] = useState<'canonical' | 'lifecycle' | 'evidence' | 'contracts'>('canonical')
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
    { id: 'canonical' as const, label: 'Canonical JSON' },
    { id: 'lifecycle' as const, label: 'Lifecycle' },
    { id: 'evidence' as const, label: 'Evidence' },
    { id: 'contracts' as const, label: 'Contracts' },
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
        <Link href="/ops/intents" className="text-sm text-gray-500 hover:text-gray-700">Intents</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">{id}</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Intents ▸ {id}</h1>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <span>Intent ID: <span className="font-mono">{id}</span> <button className="text-blue-600">[Copy]</button></span>
          <span><span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">DONE</span></span>
          <span>Type: PAYOUT</span>
          <span>Amount: ₹5,000.00 INR</span>
          <span>Confidence: 0.98</span>
          <span>Created At: 2026-02-04T10:00:01Z</span>
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

      {activeTab === 'canonical' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-500 mb-2">Schema: v2   Canonicalizer: v1.4.3</p>
          <div className="space-y-2 text-sm mb-4">
            <div><strong>beneficiary</strong><br />- token: tok_acct_f98a...<br />- display: ****1234 (HDFC)</div>
            <div><strong>constraints</strong><br />- cutoff_window: 17:00 IST<br />- corridor: INR_DOMESTIC</div>
            <div><strong>pii_tokens</strong><br />- acct: tok_acct_f98a...<br />- name: tok_name_1c3d...</div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-gray-100 rounded text-sm hover:bg-gray-200">View Full JSON</button>
            <button className="px-4 py-2 bg-gray-100 rounded text-sm hover:bg-gray-200">Copy JSON</button>
          </div>
        </div>
      )}
      {activeTab === 'lifecycle' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-green-600">✓</span>
              <div><strong>RECEIVED</strong> 10:00:01Z<br /><span className="text-gray-500 text-sm">envelope_id: env_9f3a...</span></div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600">✓</span>
              <div><strong>CANONICALIZED</strong> 10:00:02Z<br /><span className="text-gray-500 text-sm">schema_checks: PASS, semantic_checks: PASS</span></div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600">✓</span>
              <div><strong>CONTRACT_ISSUED</strong> 10:00:03Z<br /><span className="text-gray-500 text-sm">contract_id: ctr_777</span></div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600">✓</span>
              <div><strong>EVIDENCE_FINALIZED</strong> 10:05:10Z<br /><span className="text-gray-500 text-sm">certainty: 0.98</span></div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-green-600">✓</span>
              <div><strong>DONE</strong> 10:05:10Z</div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'evidence' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-600 mb-4">Linked WORM refs with evidence summary.</p>
          <Link href={`/ops/intents/${id}/evidence`} className="text-blue-600 hover:text-blue-800">
            View WORM Evidence →
          </Link>
        </div>
      )}
      {activeTab === 'contracts' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <p className="text-sm text-gray-600 mb-4">Associated contracts:</p>
          <Link href="/ops/contracts/ctr_777" className="text-blue-600 hover:text-blue-800">ctr_777</Link>
        </div>
      )}
    </div>
  )
}
