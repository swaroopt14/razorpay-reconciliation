'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser, getCurrentRole } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { UserRole } from '@/types/auth'

type BatchStatus = 'RUNNING' | 'COMPLETE' | 'PARTIAL_FAIL' | 'FAILED'
type BatchMode = 'ALL_OR_NOTHING' | 'BEST_EFFORT'
type BatchSource = 'SFTP' | 'Manual Upload' | 'Partner Feed'

interface BatchDetail {
  batch_id: string
  tenant: string
  source: BatchSource
  mode: BatchMode
  status: BatchStatus
  started_at: string
  completed_at?: string
  filename: string
  checksum: string
  file_size_bytes: number
  manifest_hash: string
  rows_total: number
  rows_accepted: number
  rows_failed: number
  processing_time_seconds: number
  error_categories: Record<string, number>
  first_intent_id?: string
  last_intent_id?: string
  intents_created: number
  worm_snapshot_path?: string
  hash_chain_status?: string
}

// Generate batch detail from batch ID
function generateBatchDetail(batchId: string): BatchDetail {
  // Extract timestamp from batch ID if possible
  let startedAt = new Date().toISOString()
  const timestampMatch = batchId.match(/b_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (timestampMatch) {
    try {
      const [, year, month, day, hour, minute, second] = timestampMatch
      const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
      const parsed = new Date(dateStr)
      if (!isNaN(parsed.getTime())) {
        startedAt = parsed.toISOString()
      }
    } catch (e) {
      // Use current time if parsing fails
    }
  }

  // Generate consistent values based on batch ID
  const hash = batchId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const sources: BatchSource[] = ['SFTP', 'Manual Upload', 'Partner Feed']
  const modes: BatchMode[] = ['ALL_OR_NOTHING', 'BEST_EFFORT']
  const statuses: BatchStatus[] = ['RUNNING', 'COMPLETE', 'PARTIAL_FAIL', 'FAILED']

  const source = sources[hash % sources.length]
  const mode = modes[hash % modes.length]
  const status = statuses[hash % statuses.length]

  const rowsTotal = Math.floor((hash % 50000) + 1000)
  const rowsAccepted = Math.floor(rowsTotal * (0.85 + (hash % 15) / 100))
  const rowsFailed = rowsTotal - rowsAccepted
  const processingTimeSeconds = Math.floor((hash % 600) + 60)
  const completedAt =
    status !== 'RUNNING'
      ? new Date(new Date(startedAt).getTime() + processingTimeSeconds * 1000).toISOString()
      : undefined

  // Generate error categories
  const errorCategories: Record<string, number> = {}
  if (rowsFailed > 0) {
    const errorTypes = [
      'INSTRUMENT_FORMAT_INVALID',
      'SCHEMA_INVALID',
      'MISSING_FIELD',
      'DUPLICATE_ENTRY',
      'POLICY_VIOLATION',
    ]
    let remaining = rowsFailed
    errorTypes.forEach((type, idx) => {
      if (idx === errorTypes.length - 1) {
        if (remaining > 0) errorCategories[type] = remaining
      } else {
        const count = Math.floor(Math.random() * remaining * 0.4)
        if (count > 0) {
          errorCategories[type] = count
          remaining -= count
        }
      }
    })
  }

  const fileSizeBytes = Math.floor((hash % 10000000) + 100000) // 100KB to 10MB
  const timestamp = new Date(startedAt).toISOString().replace(/[-:T]/g, '').split('.')[0]
  const firstIntentId = `pi_${timestamp}_0001`
  const lastIntentId = `pi_${timestamp}_${String(rowsAccepted).padStart(4, '0')}`

  return {
    batch_id: batchId,
    tenant: 'tenant_arealis_nbfc',
    source,
    mode,
    status,
    started_at: startedAt,
    completed_at: completedAt,
    filename: batchId.replace(/^b_/, '') + '.csv',
    checksum: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(
      ''
    ),
    file_size_bytes: fileSizeBytes,
    manifest_hash: Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join(''),
    rows_total: rowsTotal,
    rows_accepted: rowsAccepted,
    rows_failed: rowsFailed,
    processing_time_seconds: processingTimeSeconds,
    error_categories: errorCategories,
    first_intent_id: firstIntentId,
    last_intent_id: lastIntentId,
    intents_created: rowsAccepted,
    worm_snapshot_path: `worm://prod/batches/${batchId}/snapshot_${Date.now()}.tar.gz`,
    hash_chain_status: 'INTACT',
  }
}

function getStatusBadge(status: BatchStatus) {
  const baseClasses = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium'
  switch (status) {
    case 'COMPLETE':
      return <span className={`${baseClasses} bg-green-100 text-green-800`}>COMPLETE</span>
    case 'PARTIAL_FAIL':
      return <span className={`${baseClasses} bg-amber-100 text-amber-800`}>PARTIAL_FAIL</span>
    case 'FAILED':
      return <span className={`${baseClasses} bg-red-100 text-red-800`}>FAILED</span>
    case 'RUNNING':
      return <span className={`${baseClasses} bg-blue-100 text-blue-800`}>RUNNING</span>
    default:
      return <span className={`${baseClasses} bg-gray-100 text-gray-800`}>{status}</span>
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

// Check if user can download (RBAC gated)
function canDownload(role: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'OPS'
}

export default function BatchDetailPage() {
  const router = useRouter()
  const params = useParams()
  const batchId = params?.batch_id as string
  const [batch, setBatch] = useState<BatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const user = getCurrentUser()
  const role = getCurrentRole()
  const canDownloadExports = canDownload(role)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    if (batchId) {
      loadBatchDetail()
    }
  }, [batchId, router])

  const loadBatchDetail = async () => {
    try {
      setLoading(true)
      setError(null)
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 300))
      const detail = generateBatchDetail(batchId)
      setBatch(detail)
    } catch (error) {
      console.error('Failed to load batch detail:', error)
      setError('Failed to load batch details')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleDownloadFailedRows = () => {
    if (!canDownloadExports || !batch) return

    // Generate mock CSV
    const csvContent =
      'intent_id,error_code,row_number\n' +
      Array.from(
        { length: Math.min(batch.rows_failed, 10) },
        (_, i) =>
          `pi_${Date.now()}_${i},${Object.keys(batch.error_categories)[0] || 'UNKNOWN'},${i + 1}`
      ).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${batch.batch_id}_failed_rows.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Audit log
    console.log(
      `[AUDIT] Failed rows CSV downloaded: ${batch.batch_id} by ${
        user?.email
      } at ${new Date().toISOString()}`
    )
  }

  const handleDownloadProcessingReport = () => {
    if (!canDownloadExports || !batch) return

    const report = {
      batch_id: batch.batch_id,
      tenant: batch.tenant,
      source: batch.source,
      mode: batch.mode,
      status: batch.status,
      started_at: batch.started_at,
      completed_at: batch.completed_at,
      rows_total: batch.rows_total,
      rows_accepted: batch.rows_accepted,
      rows_failed: batch.rows_failed,
      processing_time_seconds: batch.processing_time_seconds,
      error_categories: batch.error_categories,
      manifest_hash: batch.manifest_hash,
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${batch.batch_id}_processing_report.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Audit log
    console.log(
      `[AUDIT] Processing report downloaded: ${batch.batch_id} by ${
        user?.email
      } at ${new Date().toISOString()}`
    )
  }

  const handleDownloadManifest = () => {
    if (!canDownloadExports || !batch) return

    const manifest = {
      batch_id: batch.batch_id,
      manifest_hash: batch.manifest_hash,
      filename: batch.filename,
      checksum: batch.checksum,
      rows_total: batch.rows_total,
      generated_at: new Date().toISOString(),
    }

    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${batch.batch_id}_manifest.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Audit log
    console.log(
      `[AUDIT] Manifest downloaded: ${batch.batch_id} by ${
        user?.email
      } at ${new Date().toISOString()}`
    )
  }

  if (loading) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Batch Pipelines', 'Batch Detail']}
        tenant={user?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading batch details...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !batch) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Batch Pipelines', 'Batch Detail']}
        tenant={user?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded shadow-sm p-6 text-center">
            <svg
              className="mx-auto h-12 w-12 text-red-500 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {error || 'Batch not found'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              The batch you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <button
              onClick={() => router.push('/console/ingestion/batch-pipelines')}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Back to Batch Pipelines
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout
      serviceName="Ingestion"
      breadcrumbs={['Batch Pipelines', 'Batch Detail']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto">
        {/* Sticky Header - AWS Glue/Azure Data Factory Style */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-4 mb-2">
                  <button
                    onClick={() => router.push('/console/ingestion/batch-pipelines')}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                  >
                    <svg
                      className="w-5 h-5 text-gray-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <div>
                    <h1 className="text-xl font-normal text-gray-900">
                      Batch: <span className="font-mono">{batch.batch_id}</span>
                    </h1>
                  </div>
                </div>
                <div className="ml-8 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Tenant:</span>{' '}
                    <span className="font-medium text-gray-900">{batch.tenant}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Source:</span>{' '}
                    <span className="font-medium text-gray-900">{batch.source}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Mode:</span>{' '}
                    <span className="font-mono text-gray-900">{batch.mode}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>{' '}
                    <span className="ml-2">{getStatusBadge(batch.status)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Started:</span>{' '}
                    <span className="font-mono text-gray-900">
                      {format(new Date(batch.started_at), 'yyyy-MM-dd HH:mm')} UTC
                    </span>
                  </div>
                </div>
                {batch.completed_at && (
                  <div className="ml-8 mt-2">
                    <span className="text-gray-500">Completed:</span>{' '}
                    <span className="font-mono text-gray-900">
                      {format(new Date(batch.completed_at), 'yyyy-MM-dd HH:mm')} UTC
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => copyToClipboard(batch.batch_id, 'batch-id')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="Copy Batch ID"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
                {canDownloadExports && (
                  <button
                    onClick={handleDownloadManifest}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                    title="Download Manifest"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => router.push(`/console/ingestion/audit?batch_id=${batch.batch_id}`)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="View Audit Timeline"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Section 1: File Metadata (Azure Storage Style) */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-base font-medium text-gray-900">File Metadata</h2>
              <p className="text-xs text-gray-500 mt-1">
                File integrity verification, legal defensibility
              </p>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Filename
                  </dt>
                  <dd className="text-sm font-mono text-gray-900">{batch.filename}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Checksum (SHA-256)
                  </dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {batch.checksum.substring(0, 16)}…
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Uploaded At
                  </dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {format(new Date(batch.started_at), 'yyyy-MM-dd HH:mm')} UTC
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    File Size
                  </dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatFileSize(batch.file_size_bytes)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Section 2: Processing Summary */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-base font-medium text-gray-900">Processing Summary</h2>
              <p className="text-xs text-gray-500 mt-1">Clear, unambiguous numbers</p>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Rows Total
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {batch.rows_total.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Rows Accepted
                  </dt>
                  <dd className="text-2xl font-semibold text-green-700">
                    {batch.rows_accepted.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Rows Failed
                  </dt>
                  <dd className="text-2xl font-semibold text-red-700">
                    {batch.rows_failed.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Processing Time
                  </dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {formatDuration(batch.processing_time_seconds)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Section 3: Failure Breakdown */}
          {batch.rows_failed > 0 && (
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-base font-medium text-gray-900">Failure Breakdown</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Admin truth, no masking, internal error codes allowed
                </p>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Error Code
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {Object.entries(batch.error_categories)
                        .sort(([, a], [, b]) => b - a)
                        .map(([errorCode, count]) => (
                          <tr key={errorCode} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <button
                                onClick={() =>
                                  router.push(
                                    `/console/ingestion/intents?error_code=${errorCode}&batch_id=${batch.batch_id}`
                                  )
                                }
                                className="text-sm font-mono text-blue-600 hover:text-blue-800"
                              >
                                {errorCode}
                              </button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                              {count.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Linked Objects */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-base font-medium text-gray-900">Linked Objects</h2>
              <p className="text-xs text-gray-500 mt-1">Traverse the ingestion chain</p>
            </div>
            <div className="p-6">
              <dl className="space-y-4">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Intents Created
                  </dt>
                  <dd className="text-sm font-semibold text-gray-900">
                    {batch.intents_created.toLocaleString()}
                  </dd>
                </div>
                {batch.first_intent_id && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      First Intent ID
                    </dt>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                      <span className="text-sm font-mono text-gray-900">
                        {batch.first_intent_id}
                      </span>
                      <Link
                        href={`/console/ingestion/intents/${batch.first_intent_id}`}
                        className="text-xs text-blue-600 hover:text-blue-800"
                        onClick={e => e.stopPropagation()}
                      >
                        View Intent Detail →
                      </Link>
                    </div>
                  </div>
                )}
                {batch.last_intent_id && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Last Intent ID
                    </dt>
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
                      <span className="text-sm font-mono text-gray-900">
                        {batch.last_intent_id}
                      </span>
                      <Link
                        href={`/console/ingestion/intents/${batch.last_intent_id}`}
                        className="text-xs text-blue-600 hover:text-blue-800"
                        onClick={e => e.stopPropagation()}
                      >
                        View Intent Detail →
                      </Link>
                    </div>
                  </div>
                )}
                <div className="pt-2">
                  <Link
                    href={`/console/ingestion/intents?batch_id=${batch.batch_id}`}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View all intents from this batch in Intent Ledger →
                  </Link>
                </div>
              </dl>
            </div>
          </div>

          {/* Section 5: Exports (Controlled) */}
          {canDownloadExports && (
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-base font-medium text-gray-900">Exports</h2>
                <p className="text-xs text-gray-500 mt-1">
                  RBAC-gated, audit-logged, immutable exports
                </p>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  <button
                    onClick={handleDownloadFailedRows}
                    disabled={batch.rows_failed === 0}
                    className="w-full md:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Download Failed Rows (CSV)
                  </button>
                  <button
                    onClick={handleDownloadProcessingReport}
                    className="w-full md:w-auto ml-0 md:ml-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Download Processing Report (JSON)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Section 6: Audit & Evidence */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-base font-medium text-gray-900">Audit & Evidence</h2>
              <p className="text-xs text-gray-500 mt-1">What auditors care about</p>
            </div>
            <div className="p-6">
              <dl className="space-y-4">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Manifest Hash
                  </dt>
                  <div className="flex items-center justify-between">
                    <dd className="text-sm font-mono text-gray-900">
                      {batch.manifest_hash.substring(0, 16)}…
                    </dd>
                    <button
                      onClick={() => copyToClipboard(batch.manifest_hash, 'manifest-hash')}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      {copiedField === 'manifest-hash' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                {batch.worm_snapshot_path && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      WORM Snapshot
                    </dt>
                    <dd className="text-sm font-mono text-gray-900 break-all">
                      {batch.worm_snapshot_path}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Hash Chain
                  </dt>
                  <dd className="text-sm font-medium text-green-700">
                    {batch.hash_chain_status || 'INTACT'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
