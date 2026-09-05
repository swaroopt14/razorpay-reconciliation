'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'

export default function ReplayPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [sourceType, setSourceType] = useState<'envelope' | 'intent'>('envelope')
  const [inputValue, setInputValue] = useState('')
  const [replayCanonicalization, setReplayCanonicalization] = useState(true)
  const [rebuildEvidence, setRebuildEvidence] = useState(true)

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
        <span className="text-sm font-medium text-gray-900">Replay</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">System ▸ Replay</h1>
        <p className="mt-2 text-sm text-gray-600">
          Controlled, safe replay UI. Only uses allowed paths.
        </p>
      </div>

      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        Replays recompute internal state using stored data. They do not re-charge customers or re-send payouts.
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Replay form</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Replay Source</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="source"
                  checked={sourceType === 'envelope'}
                  onChange={() => setSourceType('envelope')}
                />
                Envelope ID
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="source"
                  checked={sourceType === 'intent'}
                  onChange={() => setSourceType('intent')}
                />
                Intent ID
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Input</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={sourceType === 'envelope' ? 'env_9f3a...' : 'intent_abc123'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <button className="px-4 py-2 bg-gray-100 rounded text-sm hover:bg-gray-200">Resolve</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={replayCanonicalization}
                  onChange={(e) => setReplayCanonicalization(e.target.checked)}
                />
                Replay Canonicalization (current canonicalizer version)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rebuildEvidence}
                  onChange={(e) => setRebuildEvidence(e.target.checked)}
                />
                Rebuild Evidence Pack (no external calls)
              </label>
            </div>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Run Replay</button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Result panel</h2>
        </div>
        <div className="px-6 py-4 text-sm text-gray-500">
          Original vs Replay - Run a replay to see results.
        </div>
      </div>
    </div>
  )
}
