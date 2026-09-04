'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser, getCurrentRole } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { UserRole } from '@/types/auth'

interface RawEnvelopeDetail {
  envelope_id: string
  source: string
  source_detail?: string
  content_type: string
  size_bytes: number
  sha256: string
  received_at: string
  signature_verified: boolean
  tenant?: string
  linked_intent_ids?: string[]
  linked_batch_id?: string
  event_type?: string
  transport_metadata?: {
    remote_ip?: string
    mtls_subject?: string
    user_agent?: string
    tls_version?: string
  }
  headers?: Record<string, string>
  raw_payload: string
  access_log?: Array<{
    timestamp: string
    action: string
    user: string
  }>
}

// Generate envelope detail from envelope ID
function generateEnvelopeDetail(envelopeId: string): RawEnvelopeDetail {
  // Extract timestamp from envelope ID if possible
  let receivedAt = new Date().toISOString()
  const timestampMatch = envelopeId.match(/env_(\d{4})(\d{2})(\d{2})(?:T?)(\d{2})(\d{2})(\d{2})/)
  if (timestampMatch) {
    try {
      const [, year, month, day, hour, minute, second] = timestampMatch
      const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
      const parsed = new Date(dateStr)
      if (!isNaN(parsed.getTime())) {
        receivedAt = parsed.toISOString()
      }
    } catch (e) {
      // Use current time if parsing fails
    }
  }

  // Generate consistent values based on envelope ID
  const hash = envelopeId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const sources = ['API', 'Webhook', 'SFTP']
  const sourceDetails = ['REST API', 'Razorpay', 'S3 Upload']
  const contentTypes = ['application/json', 'application/xml', 'text/csv']

  const source = sources[hash % sources.length]
  const sourceDetail =
    source === 'Webhook' ? sourceDetails[1] : source === 'API' ? sourceDetails[0] : sourceDetails[2]
  const contentType = contentTypes[hash % contentTypes.length]
  const size = Math.floor((hash % 50000) + 100)

  // Generate mock payload
  let rawPayload = ''
  if (contentType === 'application/json') {
    rawPayload = JSON.stringify(
      {
        event: 'payment.created',
        payload: {
          payment: {
            entity: {
              amount: 125000,
              currency: 'INR',
              method: 'bank_transfer',
              id: `pay_${Date.now()}`,
            },
          },
        },
        timestamp: receivedAt,
      },
      null,
      2
    )
  } else if (contentType === 'application/xml') {
    rawPayload = `<?xml version="1.0"?>\n<intent>\n  <type>PAYOUT</type>\n  <amount value="125000.00" currency="INR"/>\n</intent>`
  } else {
    rawPayload = 'intent_type,amount,currency\nPAYOUT,125000.00,INR'
  }

  // Generate headers
  const headers: Record<string, string> = {
    'content-type': contentType,
  }
  if (source === 'Webhook') {
    headers['x-razorpay-signature'] = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
    headers['x-idempotency-key'] = `pay_${new Date(receivedAt)
      .toISOString()
      .split('T')[0]
      .replace(/-/g, '')}_emp_${Math.floor(Math.random() * 10000)}`
  } else if (source === 'API') {
    headers['authorization'] = 'Bearer ***'
    headers['x-request-id'] = `req_${Date.now()}`
  }

  return {
    envelope_id: envelopeId,
    source,
    source_detail: sourceDetail,
    content_type: contentType,
    size_bytes: size,
    sha256: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
    received_at: receivedAt,
    signature_verified: true,
    tenant: 'acme-finance-prod',
    linked_intent_ids: [`pi_${Date.now()}_${Math.floor(Math.random() * 1000)}`],
    linked_batch_id: Math.random() > 0.7 ? `batch_${Date.now()}` : undefined,
    event_type: 'INGEST_INTENT',
    transport_metadata: {
      remote_ip: `203.0.113.${Math.floor(Math.random() * 255)}`,
      mtls_subject: source === 'API' ? 'CN=razorpay-prod' : undefined,
      user_agent: source === 'Webhook' ? 'Razorpay-Webhooks/1.0' : 'Zord-Client/1.0',
      tls_version: 'TLS 1.3',
    },
    headers,
    raw_payload: rawPayload,
    access_log: [
      {
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        action: 'viewed',
        user: 'admin_j.singh',
      },
      {
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        action: 'payload downloaded',
        user: 'compliance_audit',
      },
    ],
  }
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// Check if user can download (RBAC gated)
function canDownload(role: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'OPS'
}

export default function RawEnvelopeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const envelopeId = params?.envelope_id as string
  const [envelope, setEnvelope] = useState<RawEnvelopeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [headersExpanded, setHeadersExpanded] = useState(false)
  const [payloadExpanded, setPayloadExpanded] = useState(true)

  const user = getCurrentUser()
  const role = getCurrentRole()
  const canDownloadEnvelopes = canDownload(role)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    if (envelopeId) {
      loadEnvelopeDetail()
    }
  }, [envelopeId, router])

  const loadEnvelopeDetail = async () => {
    try {
      setLoading(true)
      setError(null)
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 300))
      const detail = generateEnvelopeDetail(envelopeId)
      setEnvelope(detail)
    } catch (error) {
      console.error('Failed to load envelope detail:', error)
      setError('Failed to load envelope details')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleDownload = () => {
    if (!canDownloadEnvelopes || !envelope) return

    const blob = new Blob([envelope.raw_payload], { type: envelope.content_type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${envelope.envelope_id}.${
      envelope.content_type.includes('json')
        ? 'json'
        : envelope.content_type.includes('xml')
        ? 'xml'
        : 'txt'
    }`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Audit log
    console.log(
      `[AUDIT] Payload downloaded: ${envelope.envelope_id} by ${
        user?.email
      } at ${new Date().toISOString()}`
    )
  }

  // Mask sensitive headers
  const maskHeaderValue = (key: string, value: string): string => {
    const sensitiveKeys = ['authorization', 'x-api-key', 'x-secret']
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      return '***'
    }
    return value
  }

  if (loading) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Raw Envelopes', 'Envelope Detail']}
        tenant={user?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading envelope details...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !envelope) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Raw Envelopes', 'Envelope Detail']}
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
              {error || 'Envelope not found'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              The envelope you&apos;re looking for doesn&apos;t exist or has been removed.
            </p>
            <button
              onClick={() => router.push('/console/ingestion/raw-envelopes')}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Back to Raw Envelopes
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout
      serviceName="Ingestion"
      breadcrumbs={['Raw Envelopes', 'Envelope Detail']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto">
        {/* Sticky Header - AWS Style */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-4 mb-2">
                  <button
                    onClick={() => router.push('/console/ingestion/raw-envelopes')}
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
                      Envelope: <span className="font-mono">{envelope.envelope_id}</span>
                    </h1>
                  </div>
                </div>
                <div className="ml-8 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Source:</span>{' '}
                    <span className="font-medium text-gray-900">{envelope.source}</span>
                    {envelope.source_detail && (
                      <span className="text-gray-500"> ({envelope.source_detail})</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">Received:</span>{' '}
                    <span className="font-mono text-gray-900">
                      {format(new Date(envelope.received_at), 'yyyy-MM-dd HH:mm:ss')} UTC
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Content-Type:</span>{' '}
                    <span className="font-medium text-gray-900">{envelope.content_type}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Size:</span>{' '}
                    <span className="font-medium text-gray-900">
                      {formatSize(envelope.size_bytes)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">SHA-256:</span>{' '}
                    <span className="font-mono text-gray-900">
                      {envelope.sha256.substring(0, 16)}…
                    </span>
                  </div>
                </div>
                <div className="ml-8 mt-2">
                  <span className="text-gray-500">Signature:</span>{' '}
                  <span
                    className={`font-medium ${
                      envelope.signature_verified ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {envelope.signature_verified ? 'VERIFIED' : 'NOT VERIFIED'}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => copyToClipboard(envelope.envelope_id, 'envelope-id')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="Copy Envelope ID"
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
                <button
                  onClick={() => copyToClipboard(envelope.sha256, 'hash')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="Copy Hash"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </button>
                {canDownloadEnvelopes && (
                  <button
                    onClick={handleDownload}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                    title="Download Payload (RBAC + logged)"
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
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Section 1: Transport Metadata */}
          {envelope.transport_metadata && (
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-base font-medium text-gray-900">Transport Metadata</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Legal attribution, signature disputes, security audits
                </p>
              </div>
              <div className="p-6">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {envelope.transport_metadata.remote_ip && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Remote IP
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {envelope.transport_metadata.remote_ip}
                      </dd>
                    </div>
                  )}
                  {envelope.transport_metadata.mtls_subject && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        mTLS Subject
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {envelope.transport_metadata.mtls_subject}
                      </dd>
                    </div>
                  )}
                  {envelope.transport_metadata.user_agent && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        User-Agent
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {envelope.transport_metadata.user_agent}
                      </dd>
                    </div>
                  )}
                  {envelope.transport_metadata.tls_version && (
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        TLS Version
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {envelope.transport_metadata.tls_version}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}

          {/* Section 2: Headers (Collapsible) */}
          {envelope.headers && (
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <button
                  onClick={() => setHeadersExpanded(!headersExpanded)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div>
                    <h2 className="text-base font-medium text-gray-900">Headers</h2>
                    <p className="text-xs text-gray-500 mt-1">
                      Copy-safe, read-only, secrets masked
                    </p>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${
                      headersExpanded ? 'transform rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
              {headersExpanded && (
                <div className="p-6">
                  <div className="bg-gray-50 rounded border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <tbody className="bg-white divide-y divide-gray-200">
                        {Object.entries(envelope.headers).map(([key, value]) => (
                          <tr key={key}>
                            <td className="px-4 py-2 text-sm font-mono text-gray-500 whitespace-nowrap w-1/3">
                              {key}:
                            </td>
                            <td className="px-4 py-2 text-sm font-mono text-gray-900 break-all">
                              {maskHeaderValue(key, value)}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => copyToClipboard(value, `header-${key}`)}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                {copiedField === `header-${key}` ? 'Copied' : 'Copy'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 3: Raw Payload Viewer */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-medium text-gray-900">Raw Payload (Read-only)</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Forensic truth, not developer convenience
                </p>
              </div>
              <button
                onClick={() => setPayloadExpanded(!payloadExpanded)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {payloadExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
            <div className="p-6">
              <div className="bg-gray-900 rounded border border-gray-700 overflow-auto max-h-[600px]">
                <pre className="text-xs font-mono text-gray-100 p-4">
                  {envelope.raw_payload.split('\n').map((line, index) => (
                    <div key={index} className="flex">
                      <span className="text-gray-500 mr-4 select-none w-8 text-right">
                        {index + 1}
                      </span>
                      <span className="flex-1">{line || ' '}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          </div>

          {/* Section 4: Linked Objects */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-base font-medium text-gray-900">Linked Objects</h2>
              <p className="text-xs text-gray-500 mt-1">Traverse the ingestion chain</p>
            </div>
            <div className="p-6">
              <dl className="space-y-4">
                {envelope.linked_intent_ids && envelope.linked_intent_ids.length > 0 && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Intent ID
                    </dt>
                    <div className="space-y-2">
                      {envelope.linked_intent_ids.map((intentId, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200"
                        >
                          <span className="text-sm font-mono text-gray-900">{intentId}</span>
                          <Link
                            href={`/console/ingestion/intents/${intentId}`}
                            className="text-xs text-blue-600 hover:text-blue-800"
                            onClick={e => e.stopPropagation()}
                          >
                            View Intent Detail →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Batch ID
                  </dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {envelope.linked_batch_id || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Event Type
                  </dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {envelope.event_type || 'INGEST_INTENT'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Section 5: Access & Audit Log */}
          {envelope.access_log && envelope.access_log.length > 0 && (
            <div className="bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-base font-medium text-gray-900">Access Log</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Mandatory audit trail (AWS & Azure pattern)
                </p>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Timestamp (UTC)
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {envelope.access_log.map((log, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                            {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm')} UTC
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {log.action}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                            {log.user}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
