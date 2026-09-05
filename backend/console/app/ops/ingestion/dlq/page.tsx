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
import { canAccessDLQ } from '@/utils/permissions'

interface DLQEntry {
  receiptId: string
  rawEnvelopeId: string
  reasonCode: string
  fixHint: string
  timestamp: string
}

export default function DLQPage() {
  const router = useRouter()
  const [dlqEntries, setDlqEntries] = useState<DLQEntry[]>([])
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

    loadDLQ()
  }, [router])

  const loadDLQ = async () => {
    try {
      // Mock DLQ entries - in production, this would come from a DLQ API
      const allReceipts = await getAllReceipts()
      const failedReceipts = allReceipts.filter(r => r.status === 'FAILED')
      
      const entries: DLQEntry[] = failedReceipts.map(r => ({
        receiptId: r.id,
        rawEnvelopeId: r.receiptId,
        reasonCode: r.errorType || 'UNKNOWN',
        fixHint: getFixHint(r.errorType),
        timestamp: r.receivedAt,
      }))

      setDlqEntries(entries)
    } catch (error) {
      console.error('Failed to load DLQ:', error)
    } finally {
      setLoading(false)
    }
  }

  const getFixHint = (errorType?: string): string => {
    const hints: Record<string, string> = {
      MISSING_FIELD: 'Add the required field to the payload',
      INVALID_VALUE: 'Check the field value matches the expected format',
      UNSUPPORTED_FORMAT: 'Convert the data to a supported format (JSON or CSV)',
      POLICY_RESTRICTION: 'Review tenant policies and adjust the data accordingly',
    }
    return hints[errorType || ''] || 'Review the error details and fix the payload'
  }

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
        <div className="mb-6">
          <Link href="/ops/ingestion/monitor" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to Monitor
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dead Letter Queue (DLQ)</h1>
          <p className="mt-2 text-sm text-gray-600">
            Failed ingestion receipts that require manual intervention
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Raw Envelope ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fix Hint
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dlqEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                      No DLQ entries found
                    </td>
                  </tr>
                ) : (
                  dlqEntries.map((entry) => (
                    <tr key={entry.receiptId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {entry.rawEnvelopeId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                          {entry.reasonCode}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {entry.fixHint}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(entry.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link
                          href={`/console/ingestion/receipt/${entry.receiptId}`}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          View Receipt
                        </Link>
                        <Link
                          href={`/console/ingestion/evidence/${entry.receiptId}`}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Evidence
                        </Link>
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
