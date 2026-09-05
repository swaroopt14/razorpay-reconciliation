'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { isAuthenticated, getCurrentUser } from '@/services/auth'
import { Layout } from '@/components/aws'
import { format } from 'date-fns'
import { IdempotencyKeyDetail, IdempotencyStatus } from '@/types/validation'

function getStatusBadge(status: IdempotencyStatus) {
  const styles: Record<IdempotencyStatus, string> = {
    CONSUMED: 'bg-green-50 text-green-800 border-green-300',
    REJECTED: 'bg-red-50 text-red-800 border-red-300',
    PENDING: 'bg-yellow-50 text-yellow-800 border-yellow-300',
    EXPIRED: 'bg-gray-100 text-gray-600 border-gray-300',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

function getOutcomeBadge(outcome: string) {
  const styles: Record<string, string> = {
    ACCEPTED: 'bg-green-50 text-green-800 border-green-300',
    REJECTED: 'bg-red-50 text-red-800 border-red-300',
    PENDING: 'bg-yellow-50 text-yellow-800 border-yellow-300',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${styles[outcome] || styles.PENDING}`}>
      {outcome}
    </span>
  )
}

// Collapsible Section Component
function CollapsibleSection({ 
  title, 
  subtitle,
  defaultExpanded = true, 
  children 
}: { 
  title: string
  subtitle?: string
  defaultExpanded?: boolean
  children: React.ReactNode 
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-sm font-medium text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <svg 
          className={`w-5 h-5 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && <div className="p-6">{children}</div>}
    </div>
  )
}

export default function IdempotencyKeyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const tenant = decodeURIComponent(params?.tenant as string)
  const idempotencyKey = decodeURIComponent(params?.key as string)
  
  const [keyDetail, setKeyDetail] = useState<IdempotencyKeyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return
    }
    if (tenant && idempotencyKey) {
      loadKeyDetail()
    }
  }, [tenant, idempotencyKey, router])

  const loadKeyDetail = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(
        `/api/prod/idempotency/${encodeURIComponent(tenant)}/${encodeURIComponent(idempotencyKey)}`
      )
      if (!response.ok) {
        if (response.status === 404) {
          setError('Idempotency key not found')
          return
        }
        setError('Failed to load idempotency key details')
        return
      }
      const data: IdempotencyKeyDetail = await response.json()
      setKeyDetail(data)
    } catch (err) {
      console.error('Failed to load idempotency key detail:', err)
      setError('Failed to load idempotency key details')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const downloadJson = (data: object, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Idempotency Store', idempotencyKey]}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">Loading idempotency key details...</p>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (error || !keyDetail) {
    return (
      <Layout
        serviceName="Ingestion"
        breadcrumbs={['Validation & Safety', 'Idempotency Store', idempotencyKey]}
        tenant={getCurrentUser()?.tenant}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-red-200 rounded shadow-sm p-6 text-center">
            <svg className="mx-auto h-12 w-12 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{error || 'Key not found'}</h3>
            <button
              onClick={() => router.push('/console/ingestion/idempotency')}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Back to Idempotency Store
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
      breadcrumbs={['Validation & Safety', 'Idempotency Store', keyDetail.idempotency_key]}
      tenant={user?.tenant}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Idempotency Header */}
        <div className="bg-white border border-gray-200 rounded shadow-sm mb-6">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <button
                    onClick={() => router.push('/console/ingestion/idempotency')}
                    className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                    title="Back to list"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h1 className="text-xl font-semibold text-gray-900">Idempotency Key Detail</h1>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Key</dt>
                    <dd className="flex items-center space-x-2">
                      <span className="font-mono text-sm text-gray-900">{keyDetail.idempotency_key}</span>
                      <button
                        onClick={() => copyToClipboard(keyDetail.idempotency_key, 'key')}
                        className="text-gray-400 hover:text-gray-600"
                        title="Copy Key"
                      >
                        {copiedField === 'key' ? (
                          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tenant</dt>
                    <dd className="flex items-center space-x-2">
                      <span className="font-mono text-sm text-gray-900">{keyDetail.tenant}</span>
                      <button
                        onClick={() => copyToClipboard(keyDetail.tenant, 'tenant')}
                        className="text-gray-400 hover:text-gray-600"
                        title="Copy Tenant ID"
                      >
                        {copiedField === 'tenant' ? (
                          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Status</dt>
                    <dd>{getStatusBadge(keyDetail.status)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Environment</dt>
                    <dd>
                      <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                        PRODUCTION
                      </span>
                    </dd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Key Status & Outcome (Primary Truth) */}
        <CollapsibleSection 
          title="Key Status & Outcome" 
          subtitle="Primary truth for this idempotency record"
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">First seen at</dt>
              <dd className="text-sm font-mono text-gray-900">
                {format(new Date(keyDetail.first_seen), 'yyyy-MM-dd HH:mm:ss')} UTC
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Times received</dt>
              <dd className="text-sm font-semibold text-gray-900">{(keyDetail.replay_count || 0) + 1}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Duplicates blocked</dt>
              <dd className="text-sm text-gray-900">
                <span className="font-semibold text-red-600">{keyDetail.duplicates_blocked || keyDetail.replay_count || 0}</span>
                {keyDetail.replay_attempts && keyDetail.replay_attempts.length > 0 && (
                  <span className="text-gray-500 ml-2">
                    ({keyDetail.replay_attempts.map(r => format(new Date(r.timestamp), 'HH:mm:ss')).join(', ')} UTC)
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Final outcome</dt>
              <dd>{getOutcomeBadge(keyDetail.final_outcome || 'ACCEPTED')}</dd>
            </div>
          </dl>

          {/* Status meanings */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Status meanings</p>
            <div className="space-y-1 text-sm text-gray-600">
              <p><span className="font-mono font-medium text-green-700">CONSUMED</span> → First request accepted, all replays blocked with stored response</p>
              <p><span className="font-mono font-medium text-red-700">REJECTED</span> → Replay conflicted with original outcome or payload mismatch</p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Request Lineage (Chain of Custody) */}
        <CollapsibleSection 
          title="Request Lineage" 
          subtitle="Chain of custody - proves 1:1 envelope → intent mapping"
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">First Envelope ID</dt>
              <dd className="text-sm">
                <Link
                  href={`/console/ingestion/raw-envelopes/${keyDetail.first_envelope_id}`}
                  className="font-mono text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {keyDetail.first_envelope_id}
                </Link>
                <span className="text-gray-400 ml-2">[Open Envelope]</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Canonical Intent ID</dt>
              <dd className="text-sm">
                {keyDetail.canonical_intent_id ? (
                  <>
                    <Link
                      href={`/console/ingestion/intents/${keyDetail.canonical_intent_id}`}
                      className="font-mono text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {keyDetail.canonical_intent_id}
                    </Link>
                    <span className="text-gray-400 ml-2">[Open Intent Detail]</span>
                  </>
                ) : (
                  <span className="text-gray-400 font-mono">(not yet mapped)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Tenant ID</dt>
              <dd className="flex items-center space-x-2">
                <span className="font-mono text-sm text-gray-900">{keyDetail.tenant_id || keyDetail.tenant}</span>
                <button
                  onClick={() => copyToClipboard(keyDetail.tenant_id || keyDetail.tenant, 'tenant_id')}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  {copiedField === 'tenant_id' ? 'Copied!' : '[Copy]'}
                </button>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Request Hash</dt>
              <dd className="flex items-center space-x-2">
                <span className="font-mono text-xs text-gray-700 truncate max-w-xs">{keyDetail.request_hash}</span>
                <button
                  onClick={() => copyToClipboard(keyDetail.request_hash, 'hash')}
                  className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
                >
                  {copiedField === 'hash' ? 'Copied!' : '[Copy]'}
                </button>
              </dd>
            </div>
          </dl>
        </CollapsibleSection>

        {/* Canonical Response Snapshot (CRITICAL) */}
        <CollapsibleSection 
          title="Canonical Response Snapshot" 
          subtitle="CRITICAL: Exactly what client received on first request - immutable artifact"
        >
          <div className="mb-4 bg-blue-50 border-l-4 border-blue-400 p-3">
            <p className="text-sm text-blue-800">
              <strong>Stored once, returned for all replays.</strong> This is the exact response the client received. Read-only.
            </p>
          </div>

          <div className="bg-gray-900 rounded border border-gray-700 overflow-hidden">
            <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
              <span className="text-xs text-gray-400 font-mono">response_snapshot.json</span>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => copyToClipboard(JSON.stringify(keyDetail.response_snapshot, null, 2), 'response')}
                  className="text-xs text-gray-400 hover:text-white flex items-center space-x-1"
                >
                  {copiedField === 'response' ? (
                    <>
                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>Copy Response JSON</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => downloadJson(keyDetail.response_snapshot, `${keyDetail.idempotency_key}_response.json`)}
                  className="text-xs text-gray-400 hover:text-white flex items-center space-x-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download JSON</span>
                </button>
              </div>
            </div>
            <pre className="text-sm font-mono text-gray-100 p-4 overflow-x-auto max-h-[400px] overflow-y-auto">
              {JSON.stringify(keyDetail.response_snapshot, null, 2)}
            </pre>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            Mapped to: <span className="font-mono">idempotency_keys.response_snapshot</span>
          </p>
        </CollapsibleSection>

        {/* Enforcement Semantics */}
        <CollapsibleSection 
          title="Enforcement Semantics" 
          subtitle="How idempotency is enforced - for engineers, auditors, incident responders"
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Scope</dt>
              <dd className="text-sm font-mono text-gray-900">{keyDetail.enforcement?.scope || 'tenant_id + idempotency_key'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Enforced by</dt>
              <dd className="text-sm font-mono text-gray-900">{keyDetail.enforcement?.enforced_by || 'zord-edge'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Checked at stage</dt>
              <dd className="text-sm font-mono text-gray-900">{keyDetail.enforcement?.checked_at_stage || 'PRE-PARSE'}</dd>
            </div>
          </dl>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">On replay</p>
            <ul className="space-y-1">
              {(keyDetail.enforcement?.on_replay_actions || [
                'Skip parsing',
                'Skip schema validation',
                'Return stored response (no side effects)'
              ]).map((action, i) => (
                <li key={i} className="flex items-center space-x-2 text-sm text-gray-700">
                  <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </CollapsibleSection>

        {/* Replay Attempts (Visibility, Not Control) */}
        <CollapsibleSection 
          title="Replay Attempts" 
          subtitle="Visibility only - no retry/reset buttons (fintech compliance)"
        >
          {keyDetail.replay_attempts && keyDetail.replay_attempts.length > 0 ? (
            <div className="space-y-2">
              {keyDetail.replay_attempts.map((attempt, i) => (
                <div 
                  key={i} 
                  className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded border border-gray-200"
                >
                  <span className="text-sm font-mono text-gray-700">
                    {format(new Date(attempt.timestamp), 'yyyy-MM-dd HH:mm:ss')} UTC
                  </span>
                  <span className={`text-sm font-medium ${
                    attempt.outcome === 'blocked' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    → {attempt.outcome === 'blocked' ? 'Blocked (duplicate)' : 'Allowed'}
                  </span>
                </div>
              ))}
            </div>
          ) : keyDetail.replay_count > 0 ? (
            <div className="space-y-2">
              {Array.from({ length: keyDetail.replay_count }).map((_, i) => (
                <div 
                  key={i} 
                  className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded border border-gray-200"
                >
                  <span className="text-sm font-mono text-gray-700">
                    {keyDetail.last_replay_at && i === 0 
                      ? format(new Date(keyDetail.last_replay_at), 'yyyy-MM-dd HH:mm:ss') + ' UTC'
                      : 'Timestamp not recorded'}
                  </span>
                  <span className="text-sm font-medium text-red-600">→ Blocked (duplicate)</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-500">No replay attempts recorded</p>
              <p className="text-xs text-gray-400 mt-1">This key was only used once</p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500 italic">
              No payload shown. No retry buttons. AWS/Stripe pattern: visibility without action.
            </p>
          </div>
        </CollapsibleSection>

        {/* Audit & Evidence (Fintech-Required) */}
        <CollapsibleSection 
          title="Audit & Evidence" 
          subtitle="Fintech-required - regulatory compliance proof"
        >
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Idempotency record immutable</dt>
              <dd className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  keyDetail.audit?.record_immutable !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {keyDetail.audit?.record_immutable !== false ? 'YES' : 'NO'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Stored in WORM evidence</dt>
              <dd className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  keyDetail.audit?.stored_in_worm !== false ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {keyDetail.audit?.stored_in_worm !== false ? 'YES' : 'PENDING'}
                </span>
              </dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Evidence reference</dt>
              <dd className="text-sm font-mono text-gray-700 break-all">
                {keyDetail.audit?.evidence_ref || `worm://prod/idempotency/${keyDetail.idempotency_key}`}
              </dd>
            </div>
          </dl>

          {keyDetail.audit?.evidence_receipt_id && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Link
                href={`/console/ingestion/evidence/${keyDetail.audit.evidence_receipt_id}`}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View idempotency evidence receipt
              </Link>
            </div>
          )}

          <p className="mt-4 text-xs text-gray-500">
            Mapped to: <span className="font-mono">intent_worm_ref + zord-contracts</span>
          </p>
        </CollapsibleSection>

        {/* Database Mapping (for developers) */}
        <CollapsibleSection 
          title="Direct Table Mapping" 
          subtitle="Phase-1 tables - for developers and incident responders"
          defaultExpanded={false}
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UI Section</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Table Column(s)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">Key header</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">idempotency_keys.idempotency_key, tenant_id</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">Status</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">idempotency_keys.status</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">First envelope</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">idempotency_keys.first_envelope_id</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">Intent mapping</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">idempotency_keys.canonical_intent_id</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">Response snapshot</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">idempotency_keys.response_snapshot</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">Replay attempts</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">ingress_envelopes JOIN idempotency_keys ON idempotency_key</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm text-gray-900">Audit & evidence</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">intent_worm_ref (evidence pointer)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        {/* Final Lock Statement */}
        <div className="bg-gray-900 border border-gray-700 rounded shadow-sm p-4 text-center">
          <p className="text-sm text-gray-300">
            <span className="text-white font-medium">If this page is correct, duplicate money movement is mathematically impossible.</span>
            <br />
            <span className="text-gray-400">That is exactly what regulators expect.</span>
          </p>
        </div>
      </div>
    </Layout>
  )
}
