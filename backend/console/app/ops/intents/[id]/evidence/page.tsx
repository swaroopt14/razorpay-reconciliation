'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { RoleSwitcher } from '@/components/auth'
import { canAccessDLQ } from '@/utils/permissions'

export default function IntentEvidencePage() {
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
        <Link href={`/ops/intents/${id}`} className="text-sm text-gray-500 hover:text-gray-700">{id}</Link>
        <span className="mx-2 text-gray-400">▸</span>
        <span className="text-sm font-medium text-gray-900">WORM Evidence</span>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Intents ▸ {id} ▸ WORM Evidence</h1>
        <p className="mt-2 text-sm text-gray-600">
          Expose WORM snapshot metadata for an intent; prove tamper-evidence.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Summary</h2>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          <div>Intent ID: {id}</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Worm Object:</span>
            <span className="font-mono">worm://vault/2026/02/04/{id}.worm</span>
            <button className="text-blue-600 hover:text-blue-800 text-xs">[Copy]</button>
          </div>
          <div>Snapshot Time: 2026-02-04T10:05:11Z</div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Hash Chain</h2>
        </div>
        <div className="px-6 py-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Hash Chain Head:</span>
            <span className="font-mono">9b7c…</span>
            <button className="text-blue-600 hover:text-blue-800 text-xs">[Copy]</button>
          </div>
          <div>Chain status: <span className="text-green-600 font-medium">VALID</span> (verified at 2026-02-04T10:06:00Z) <button className="text-blue-600 text-xs">[Re-verify]</button></div>
        </div>
      </div>

      <div className="flex gap-2">
        <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Download WORM Snapshot</button>
        <button className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm">Verify Integrity</button>
      </div>
    </div>
  )
}
