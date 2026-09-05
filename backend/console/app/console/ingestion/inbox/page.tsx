'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { getAllReceipts } from '@/services/api'
import { Receipt } from '@/types/receipt'
import { StatusBadge } from '@/components/ingestion'
import { format } from 'date-fns'
import { Layout, PageHeader, DataTable, type Column } from '@/components/aws'
import { canAccessInbox } from '@/utils/permissions'
import Link from 'next/link'

export default function InboxPage() {
  const router = useRouter()
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }

    const user = getCurrentUser()
    if (user && !canAccessInbox(user.role)) {
      router.push('/console/ingestion')
      return
    }

    loadReceipts()
  }, [router])

  const loadReceipts = async () => {
    try {
      const user = getCurrentUser()
      const allReceipts = await getAllReceipts(user?.tenant)
      setReceipts(allReceipts.sort((a, b) => 
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      ))
    } catch (error) {
      console.error('Failed to load receipts:', error)
    } finally {
      setLoading(false)
    }
  }

  const columns: Column<Receipt>[] = [
    {
      key: 'receiptId',
      header: 'Receipt ID',
      sortable: true,
      render: (receipt) => (
        <Link
          href={`/console/ingestion/receipt/${receipt.id}`}
          className="text-blue-600 hover:text-blue-800"
          onClick={(e) => e.stopPropagation()}
        >
          {receipt.receiptId}
        </Link>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      filterable: true,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      filterable: true,
      render: (receipt) => <StatusBadge status={receipt.status} />,
    },
    {
      key: 'receivedAt',
      header: 'Received At',
      sortable: true,
      render: (receipt) => format(new Date(receipt.receivedAt), 'yyyy-MM-dd HH:mm:ss'),
    },
    {
      key: 'batchId',
      header: 'Batch ID',
      sortable: true,
      render: (receipt) => receipt.batchId || '-',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (receipt) => (
        <div className="flex items-center space-x-2">
          <Link
            href={`/console/ingestion/receipt/${receipt.id}`}
            className="text-blue-600 hover:text-blue-800 text-sm"
            onClick={(e) => e.stopPropagation()}
            title="View receipt details"
          >
            View
          </Link>
          {receipt.evidenceExists && (
            <>
              <span className="text-gray-300">|</span>
              <Link
                href={`/console/ingestion/evidence/${receipt.id}`}
                className="text-blue-600 hover:text-blue-800 text-sm"
                onClick={(e) => e.stopPropagation()}
                title="View evidence trail"
              >
                Evidence
              </Link>
            </>
          )}
        </div>
      ),
    },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  const user = getCurrentUser()

  return (
    <Layout 
      serviceName="Ingestion"
      breadcrumbs={['Batches']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <PageHeader
          title="Receipt Inbox"
          description="View all ingestion receipts and their status"
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Ingestion', href: '/console/ingestion' },
            { label: 'Inbox' },
          ]}
        />

        <DataTable
          data={receipts}
          columns={columns}
          getRowKey={(receipt) => receipt.id}
          onRowClick={(receipt) => {
            router.push(`/console/ingestion/receipt/${receipt.id}`)
          }}
          filterPlaceholder="Filter by receipt ID, source, status, or batch ID..."
          emptyMessage="No receipts found"
        />
      </div>
    </Layout>
  )
}
