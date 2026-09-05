'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { DLQItemDetail, GuardStage, GuardReasonCode } from '@/types/validation'

function getStageBadge(stage: GuardStage) {
  const styles: Record<GuardStage, string> = {
    SCHEMA_VALIDATION: 'bg-blue-50 text-blue-800 border-blue-200',
    IDEMPOTENCY_CHECK: 'bg-purple-50 text-purple-800 border-purple-200',
    PII_TOKENIZATION: 'bg-orange-50 text-orange-800 border-orange-200',
    BENEFICIARY_VALIDATION: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    AMOUNT_CURRENCY_SANITY: 'bg-green-50 text-green-800 border-green-200',
    DEADLINE_CONSTRAINTS: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${styles[stage]}`}
    >
      {stage.replace(/_/g, ' ')}
    </span>
  )
}

export default function DLQItemDetailPage() {
  const router = useRouter()
  const params = useParams()
  const dlqId = params?.dlq_id as string
  
  const [dlqItem, setDlqItem] = useState<DLQItemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    if (dlqId) {
      loadDLQItem()
    }
  }, [dlqId, router])

  const loadDLQItem = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/prod/dlq/${dlqId}`)
      if (!response.ok) {
        if (response.status === 404) {
          setError('DLQ item not found')
          return
        }
        setError('Failed to load DLQ item details')
        return
      }
      const data: DLQItemDetail = await response.json()
      setDlqItem(data)
    } catch (err) {
      console.error('Failed to load DLQ item detail:', err)
      setError('Failed to load DLQ item details')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (loading) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Pre-ACC Guard', 'DLQ Item']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading DLQ item details...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !dlqItem) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Pre-ACC Guard', 'DLQ Item']}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded shadow-sm p-6 text-center">
            <svg className="mx-auto h-12 w-12 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{error || 'DLQ item not found'}</h3>
            <button
              onClick={() => router.push('/console/ingestion/pre-acc-guard')}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Back to Pre-ACC Guard
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const user = getCurrentUser()

  return (
    <Layout
      serviceName="Ingestion"
      breadcrumbs={['Validation & Safety', 'Pre-ACC Guard', 'DLQ Item']}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-4 mb-2">
                  <button
                    onClick={() => router.push('/console/ingestion/pre-acc-guard')}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div>
                    <h1 className="text-xl font-normal text-gray-900">DLQ Item</h1>
                    <p className="text-sm text-gray-500 font-mono">{dlqItem.dlq_id}</p>
                  </div>
                </div>
                <div className="ml-8 flex items-center space-x-4 text-sm">
                  <span>Stage: {getStageBadge(dlqItem.stage)}</span>
                  <span className="text-gray-500">•</span>
                  <span className={`font-medium ${dlqItem.replayable ? 'text-green-600' : 'text-red-600'}`}>
                    Replayable: {dlqItem.replayable ? 'YES' : 'NO'}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => copyToClipboard(dlqItem.dlq_id, 'dlq-id')}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  title="Copy DLQ ID"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Error Banner */}
          <div className="mb-6 bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-red-800">
                  Guard Failure: {dlqItem.stage.replace(/_/g, ' ')}
                </h3>
                <p className="mt-1 text-sm text-red-700">
                  <strong>Reason Code:</strong> {dlqItem.reason_code}
                </p>
              </div>
            </div>
          </div>

          {/* Read-Only Banner */}
          <div className="mb-6 bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  <strong>Read-only guardrail:</strong> This page explains why the intent was blocked. DLQ items cannot be modified from the console.
                </p>
              </div>
            </div>
          </div>

          {/* Error Details */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Error Details</h2>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Reason Code
                  </dt>
                  <dd className="text-sm font-mono text-red-600 font-semibold">{dlqItem.reason_code}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Failure Stage
                  </dt>
                  <dd>{getStageBadge(dlqItem.stage)}</dd>
                </div>
                <div className="md:col-span-2">
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Error Detail
                  </dt>
                  <dd className="text-sm text-gray-900 bg-gray-50 p-3 rounded border border-gray-200 font-mono">
                    {dlqItem.error_detail}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Replayable
                  </dt>
                  <dd className={`text-sm font-semibold ${dlqItem.replayable ? 'text-green-600' : 'text-red-600'}`}>
                    {dlqItem.replayable ? 'YES' : 'NO'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Replay Attempts
                  </dt>
                  <dd className="text-sm text-gray-900">{dlqItem.replay_attempts}</dd>
                </div>
                {dlqItem.last_replay_at && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      Last Replay At
                    </dt>
                    <dd className="text-sm font-mono text-gray-900">
                      {format(new Date(dlqItem.last_replay_at), 'yyyy-MM-dd HH:mm:ss')} UTC
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Created At
                  </dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {format(new Date(dlqItem.created_at), 'yyyy-MM-dd HH:mm:ss')} UTC
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Linked Objects */}
          <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Linked Objects</h2>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Envelope
                  </dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {dlqItem.linked_envelope ? (
                      <Link
                        href={`/console/ingestion/raw-envelopes?envelope=${dlqItem.linked_envelope.envelope_id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {dlqItem.linked_envelope.envelope_id}
                      </Link>
                    ) : (
                      <span className="text-gray-400">(none)</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Intent
                  </dt>
                  <dd className="text-sm font-mono text-gray-900">
                    {dlqItem.linked_intent_id ? (
                      <Link
                        href={`/console/ingestion/intents/${dlqItem.linked_intent_id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {dlqItem.linked_intent_id}
                      </Link>
                    ) : (
                      <span className="text-gray-400">(none)</span>
                    )}
                  </dd>
                </div>
                {dlqItem.linked_envelope && (
                  <>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Envelope Source
                      </dt>
                      <dd className="text-sm text-gray-900">{dlqItem.linked_envelope.source}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        Received At
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">
                        {format(new Date(dlqItem.linked_envelope.received_at), 'yyyy-MM-dd HH:mm:ss')} UTC
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </div>
          </div>

          {/* Payload Hash */}
          {dlqItem.raw_payload_hash && (
            <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">Raw Payload Hash</h2>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between bg-gray-50 rounded border border-gray-200 p-3">
                  <code className="text-xs font-mono text-gray-900 break-all">{dlqItem.raw_payload_hash}</code>
                  <button
                    onClick={() => copyToClipboard(dlqItem.raw_payload_hash!, 'hash')}
                    className="ml-3 text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
                  >
                    {copiedField === 'hash' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Metadata */}
          {dlqItem.metadata && Object.keys(dlqItem.metadata).length > 0 && (
            <div className="mb-6 bg-white border border-gray-200 rounded shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-medium text-gray-900">Metadata</h2>
              </div>
              <div className="p-6">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(dlqItem.metadata).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                        {key.replace(/_/g, ' ')}
                      </dt>
                      <dd className="text-sm font-mono text-gray-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {/* Database Mapping */}
          <div className="bg-white border border-gray-200 rounded shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-medium text-gray-900">Database Mapping</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      UI Field
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Table
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Guard failures</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">dlq_items</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Failure stage</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">dlq_items.stage</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Replayability</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">dlq_items.replayable</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Error reason</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">dlq_items.reason_code</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
