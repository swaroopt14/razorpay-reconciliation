'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { TopBar } from '@/components/aws'
import { getBatch } from '@/services/api'
import { Batch, FailedRow } from '@/types/batch'
import { StatusBadge } from '@/components/ingestion'
import { format } from 'date-fns'
import { Layout, PageHeader, DataTable, type Column } from '@/components/aws'
import { canReUpload } from '@/utils/permissions'
import { createPolling } from '@/utils/polling'

export default function BatchPage() {
  const router = useRouter()
  const params = useParams()
  const batchId = params.batchId as string
  const [batch, setBatch] = useState<Batch | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }

    loadBatch()

    // Poll for updates if still processing
    const shouldStop = (b: Batch) => b.processing === 0
    const poll = createPolling(() => getBatch(batchId), shouldStop, 3000)

    const stopPolling = poll((updatedBatch) => {
      setBatch(updatedBatch)
    })

    return () => {
      stopPolling()
    }
  }, [batchId, router])

  const loadBatch = async () => {
    try {
      const data = await getBatch(batchId)
      setBatch(data)
    } catch (error) {
      console.error('Failed to load batch:', error)
    } finally {
      setLoading(false)
    }
  }

  const user = getCurrentUser()

  if (loading || !batch) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  const successRate = batch.totalRecords > 0 
    ? ((batch.canonicalized / batch.totalRecords) * 100).toFixed(1)
    : '0'

  const failedColumns: Column<FailedRow>[] = [
    {
      key: 'rowNumber',
      header: 'Row Number',
      sortable: true,
    },
    {
      key: 'receiptId',
      header: 'Receipt ID',
      sortable: true,
      render: (row) => (
        <Link
          href={`/console/ingestion/receipt/${row.receiptId}`}
          className="text-blue-600 hover:text-blue-800"
          onClick={(e) => e.stopPropagation()}
        >
          {row.receiptId}
        </Link>
      ),
    },
    {
      key: 'error',
      header: 'Error',
      render: (row) => <span className="text-red-600">{row.error}</span>,
    },
    {
      key: 'errorType',
      header: 'Error Type',
      sortable: true,
      filterable: true,
    },
    {
      key: 'uploadedAt',
      header: 'Uploaded At',
      sortable: true,
      render: (row) => format(new Date(row.uploadedAt), 'yyyy-MM-dd HH:mm:ss'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center space-x-2">
          <Link
            href={`/console/ingestion/receipt/${row.receiptId}`}
            className="text-blue-600 hover:text-blue-800 text-sm"
            onClick={(e) => e.stopPropagation()}
            title="View receipt details"
          >
            View Receipt
          </Link>
          <span className="text-gray-300">|</span>
          <Link
            href={`/console/ingestion/evidence/${row.receiptId}`}
            className="text-blue-600 hover:text-blue-800 text-sm"
            onClick={(e) => e.stopPropagation()}
            title="View evidence trail"
          >
            Evidence
          </Link>
        </div>
      ),
    },
  ]

  return (
    <Layout 
      serviceName="Ingestion"
      breadcrumbs={['Batches', 'Batch Details']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <PageHeader
          title={`Batch: ${batch.batchId}`}
          description={`Uploaded at ${format(new Date(batch.uploadedAt), 'yyyy-MM-dd HH:mm:ss')}`}
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Ingestion', href: '/console/ingestion' },
            { label: 'Inbox', href: '/console/ingestion/inbox' },
            { label: 'Batch Details' },
          ]}
        />

        {/* Batch Summary Table */}
        <div className="mb-6 bg-white border border-gray-300">
          <div className="px-4 py-3 border-b border-gray-300 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900">Batch Summary</h2>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-50" style={{ width: '200px' }}>
                  Total Records
                </td>
                <td className="px-6 py-3 text-sm text-gray-900">{batch.totalRecords}</td>
              </tr>
              <tr>
                <td className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-50">
                  Canonicalized
                </td>
                <td className="px-6 py-3 text-sm text-gray-900">{batch.canonicalized}</td>
              </tr>
              <tr>
                <td className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-50">
                  Failed
                </td>
                <td className="px-6 py-3 text-sm text-red-600">{batch.failed}</td>
              </tr>
              <tr>
                <td className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-50">
                  Processing
                </td>
                <td className="px-6 py-3 text-sm text-yellow-600">{batch.processing}</td>
              </tr>
              <tr>
                <td className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-50">
                  Success Rate
                </td>
                <td className="px-6 py-3 text-sm text-gray-900">
                  {successRate}% ({batch.canonicalized} of {batch.totalRecords})
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Failed Rows Table */}
        {batch.failedRows.length > 0 && (
          <div className="mb-6">
            <PageHeader
              title="Failed Rows"
              description={`${batch.failedRows.length} row(s) failed during processing`}
            />
            <DataTable
              data={batch.failedRows}
              columns={failedColumns}
              getRowKey={(row) => row.receiptId}
              onRowClick={(row) => {
                router.push(`/console/ingestion/receipt/${row.receiptId}`)
              }}
              filterPlaceholder="Filter by receipt ID, error type, or error message..."
              emptyMessage="No failed rows"
            />
          </div>
        )}

        {/* Re-Upload Section */}
        {canReUpload(user?.role || 'CUSTOMER_USER') && batch.failed > 0 && (
          <div className="bg-white border border-gray-300">
            <div className="px-4 py-3 border-b border-gray-300 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Re-Upload Failed Rows</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">
                Download the failed rows, fix the issues, and upload again. Each re-upload will generate new receipts.
              </p>
              <div className="flex items-center space-x-2">
                <button 
                  className="px-3 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  title="Download failed rows as CSV for correction"
                >
                  Download Failed Rows
                </button>
                <Link
                  href="/console/ingestion/upload"
                  className="px-3 py-2 border border-transparent rounded text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                  title="Upload corrected file to create new receipts"
                >
                  Upload Fixed File
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
