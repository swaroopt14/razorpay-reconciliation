'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { getReceipt } from '@/services/api'
import { Receipt } from '@/types/receipt'
import { ReceiptTimeline, StatusBadge, ErrorExplanationBox } from '@/components/ingestion'
import { format } from 'date-fns'
import { TopBar } from '@/components/aws'
import { canViewEvidence, canRetry, canDownloadEvidence } from '@/utils/permissions'
import { createPolling } from '@/utils/polling'

export default function ReceiptPage() {
  const router = useRouter()
  const params = useParams()
  const receiptId = params.receiptId as string
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }

    loadReceipt()

    // Set up polling for non-terminal states
    const shouldStop = (r: Receipt) => r.status === 'CANONICALIZED' || r.status === 'FAILED'
    const poll = createPolling(() => getReceipt(receiptId), shouldStop, 3000)

    const stopPolling = poll(updatedReceipt => {
      setReceipt(updatedReceipt)
    })

    return () => {
      stopPolling()
    }
  }, [receiptId, router])

  const loadReceipt = async () => {
    try {
      const data = await getReceipt(receiptId)
      setReceipt(data)
    } catch (error) {
      console.error('Failed to load receipt:', error)
    } finally {
      setLoading(false)
    }
  }

  const user = getCurrentUser()

  if (loading || !receipt) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar tenant={user?.tenant} serviceName="Ingestion" breadcrumbs={['Inbox', 'Receipt']} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href="/console/ingestion/inbox"
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            ← Back to Inbox
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Receipt Details</h1>
              <p className="mt-1 text-sm text-gray-600">Receipt ID: {receipt.receiptId}</p>
            </div>
            <StatusBadge status={receipt.status} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <p className="text-sm font-medium text-gray-500">Source</p>
              <p className="mt-1 text-sm text-gray-900">{receipt.source}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Tenant</p>
              <p className="mt-1 text-sm text-gray-900">{receipt.tenant}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Received At (UTC)</p>
              <p className="mt-1 text-sm text-gray-900">
                {format(new Date(receipt.receivedAt), 'yyyy-MM-dd HH:mm:ss')} UTC
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Received At (Local)</p>
              <p className="mt-1 text-sm text-gray-900">
                {format(new Date(receipt.receivedAt), 'yyyy-MM-dd HH:mm:ss')}
              </p>
            </div>
          </div>

          {receipt.batchId && (
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-500">Batch ID</p>
              <Link
                href={`/console/ingestion/batch/${receipt.batchId}`}
                className="mt-1 text-sm text-blue-600 hover:text-blue-800"
              >
                {receipt.batchId}
              </Link>
            </div>
          )}

          <ErrorExplanationBox receipt={receipt} />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
          <ReceiptTimeline
            receiptId={receipt.id}
            status={receipt.status}
            receivedAt={receipt.receivedAt}
          />
        </div>

        <div className="flex items-center justify-end space-x-4">
          {canViewEvidence(user?.role || 'CUSTOMER_USER') && receipt.evidenceExists && (
            <Link
              href={`/console/ingestion/evidence/${receipt.id}`}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              View Evidence
            </Link>
          )}
          {canRetry(user?.role || 'CUSTOMER_USER') && receipt.status === 'FAILED' && (
            <button className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Retry
            </button>
          )}
          {canDownloadEvidence(user?.role || 'CUSTOMER_USER') && receipt.evidenceExists && (
            <button className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
              Download Evidence
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
