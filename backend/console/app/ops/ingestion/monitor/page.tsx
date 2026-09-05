'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { getAllReceipts } from '@/services/api'
import { Receipt } from '@/types/receipt'
import { StatusBadge } from '@/components/ingestion'
import { format } from 'date-fns'
import { RoleSwitcher } from '@/components/auth'
import { canAccessMonitor } from '@/utils/permissions'

export default function MonitorPage() {
  const router = useRouter()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTenant, setSelectedTenant] = useState<string>('')

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/ops/login')
      return
    }

    const user = getCurrentUser()
    if (user && !canAccessMonitor(user.role)) {
      router.push('/ops/login')
      return
    }

    loadReceipts()

    // Poll for new receipts
    const interval = setInterval(() => {
      loadReceipts()
    }, 3000)

    return () => clearInterval(interval)
  }, [router, selectedTenant])

  const loadReceipts = async () => {
    try {
      const allReceipts = await getAllReceipts(selectedTenant || undefined)
      // Sort by receivedAt descending
      allReceipts.sort((a, b) => 
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      )
      setReceipts(allReceipts)
    } catch (error) {
      console.error('Failed to load receipts:', error)
    } finally {
      setLoading(false)
    }
  }

  const tenants = Array.from(new Set(receipts.map(r => r.tenant)))
  const filteredReceipts = selectedTenant 
    ? receipts.filter(r => r.tenant === selectedTenant)
    : receipts

  // Spike detection (simple: more than 10 receipts in last minute)
  const recentReceipts = receipts.filter(r => {
    const receiptTime = new Date(r.receivedAt).getTime()
    const oneMinuteAgo = Date.now() - 60000
    return receiptTime > oneMinuteAgo
  })
  const hasSpike = recentReceipts.length > 10

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <RoleSwitcher />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Ingestion Monitor</h1>
          <p className="mt-2 text-sm text-gray-600">
            Live stream of all ingestion receipts across tenants
          </p>
        </div>

        {hasSpike && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm font-medium text-yellow-800">
                Spike detected: {recentReceipts.length} receipts in the last minute
              </p>
            </div>
          </div>
        )}

        <div className="mb-6 flex items-center space-x-4">
          <label htmlFor="tenant-filter" className="text-sm font-medium text-gray-700">
            Filter by Tenant:
          </label>
          <select
            id="tenant-filter"
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Tenants</option>
            {tenants.map(tenant => (
              <option key={tenant} value={tenant}>{tenant}</option>
            ))}
          </select>
          <Link
            href="/ops/ingestion/dlq"
            className="ml-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            View DLQ
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Receipt ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Received At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                      No receipts found
                    </td>
                  </tr>
                ) : (
                  filteredReceipts.map((receipt) => (
                    <tr key={receipt.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {receipt.receiptId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {receipt.tenant}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {receipt.source}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={receipt.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(receipt.receivedAt), 'yyyy-MM-dd HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link
                          href={`/console/ingestion/receipt/${receipt.id}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View
                        </Link>
                        {receipt.evidenceExists && (
                          <>
                            <span className="mx-2 text-gray-300">|</span>
                            <Link
                              href={`/console/ingestion/evidence/${receipt.id}`}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Evidence
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
