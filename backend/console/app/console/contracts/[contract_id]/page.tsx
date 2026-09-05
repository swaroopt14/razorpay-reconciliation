'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Layout } from '@/components/aws'
import { getCurrentUser, isAuthenticated } from '@/services/auth'
import { format } from 'date-fns'

type ContractStatus =
  | 'ISSUED'
  | 'SUBMITTED'
  | 'SETTLING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CONFLICT'
  | 'EXPIRED'
  | string

type PayoutContract = {
  contract_id: string
  tenant_id?: string
  intent_id?: string
  envelope_id?: string
  contract_payload?: unknown
  contract_hash?: string
  status?: ContractStatus
  created_at?: string
  trace_id?: string
  provider?: string
  updated_at?: string
  last_updated?: string
}

const TERMINAL_STATES = new Set(['SUCCEEDED', 'FAILED', 'EXPIRED', 'CONFLICT'])

function maskHash(hash?: string, expanded?: boolean): string {
  if (!hash) return '-'
  if (expanded) return hash
  if (hash.length <= 18) return hash
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`
}

function safeDate(value?: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function decodePayload(payload: unknown): unknown {
  if (payload == null) return null
  if (typeof payload === 'object') return payload
  if (typeof payload !== 'string') return payload

  // backend currently returns base64-encoded JSON (string). Decode best-effort.
  try {
    const json = atob(payload)
    return JSON.parse(json)
  } catch {
    try {
      return JSON.parse(payload)
    } catch {
      return payload
    }
  }
}

function statusBadgeClass(status?: ContractStatus): string {
  const s = (status || '').toUpperCase()
  const map: Record<string, string> = {
    ISSUED: 'bg-blue-50 text-blue-800 border-blue-300',
    SUBMITTED: 'bg-purple-50 text-purple-800 border-purple-300',
    SETTLING: 'bg-orange-50 text-orange-800 border-orange-300',
    SUCCEEDED: 'bg-green-50 text-green-800 border-green-300',
    FAILED: 'bg-red-50 text-red-800 border-red-300',
    CONFLICT: 'bg-yellow-50 text-yellow-800 border-yellow-300',
    EXPIRED: 'bg-gray-100 text-gray-800 border-gray-300',
  }
  return map[s] || 'bg-gray-100 text-gray-800 border-gray-300'
}

function buildLifecycle(status?: ContractStatus) {
  const s = (status || '').toUpperCase()
  const base = ['ISSUED', 'SUBMITTED', 'SETTLING']

  let terminal: string | null = null
  if (['SUCCEEDED', 'FAILED', 'CONFLICT', 'EXPIRED'].includes(s)) terminal = s
  else if (['ISSUED', 'SUBMITTED', 'SETTLING'].includes(s)) terminal = null
  else terminal = null

  const steps = [...base, ...(terminal ? [terminal] : ['SUCCEEDED'])]
  const idx = steps.indexOf(s)
  return steps.map((step, i) => ({
    step,
    done: idx >= 0 ? i <= idx : step === 'ISSUED',
  }))
}

export default function ConsoleContractDetailPage() {
  const params = useParams()
  const contractId = params.contract_id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contract, setContract] = useState<PayoutContract | null>(null)

  const [hashExpanded, setHashExpanded] = useState(false)
  const [payloadExpanded, setPayloadExpanded] = useState(true)

  const load = async () => {
    setError(null)
    try {
      const res = await fetch(`/api/prod/payout-contracts/${encodeURIComponent(contractId)}`, { cache: 'no-store' })
      if (res.status === 404) {
        setContract(null)
        setError('Contract not found')
        return
      }
      if (!res.ok) throw new Error(`Failed to load contract: ${res.status}`)
      const data = (await res.json()) as PayoutContract
      setContract(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contract')
      setContract(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated()) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId])

  // Poll every 3s until terminal state.
  useEffect(() => {
    const status = (contract?.status || '').toUpperCase()
    if (!contractId) return
    if (!isAuthenticated()) return
    if (status && TERMINAL_STATES.has(status)) return

    const t = setInterval(() => {
      load()
    }, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, contract?.status])

  const created = safeDate(contract?.created_at)
  const updated = safeDate(contract?.updated_at || contract?.last_updated)

  const payload = useMemo(() => decodePayload(contract?.contract_payload), [contract?.contract_payload])
  const lifecycle = useMemo(() => buildLifecycle(contract?.status), [contract?.status])

  if (!isAuthenticated()) {
    return (
      <Layout serviceName="Ingestion" breadcrumbs={['Contracts', 'Contract Detail']} tenant={getCurrentUser()?.tenant}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white border border-gray-200 rounded shadow-sm p-6">
            <p className="text-sm text-gray-700">Please sign in to view contracts.</p>
            <div className="mt-4">
              <Link href="/console/login" className="text-blue-600 hover:text-blue-800 underline">Go to login</Link>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout serviceName="Ingestion" breadcrumbs={['Contracts', contractId]} tenant={getCurrentUser()?.tenant}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-5 border-b border-gray-200 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-normal text-gray-900">
                Contract - <span className="font-mono">{contractId}</span>
              </h1>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-700">
                <span className={`inline-flex items-center px-2.5 py-1 rounded border text-xs font-medium ${statusBadgeClass(contract?.status)}`}>
                  {contract?.status || (loading ? 'LOADING' : 'UNKNOWN')}
                </span>
                <span>
                  <span className="text-gray-500">Provider:</span>{' '}
                  <span className="font-medium text-gray-900">{contract?.provider || '-'}</span>
                </span>
                <span>
                  <span className="text-gray-500">Created:</span>{' '}
                  <span className="font-mono text-gray-900">{created ? `${created.toISOString()} (UTC)` : '-'}</span>
                </span>
                <span>
                  <span className="text-gray-500">Local:</span>{' '}
                  <span className="font-mono text-gray-900">{created ? format(created, 'yyyy-MM-dd HH:mm:ssXXX') : '-'}</span>
                </span>
                <span>
                  <span className="text-gray-500">Last Updated:</span>{' '}
                  <span className="font-mono text-gray-900">{updated ? updated.toISOString() : '-'}</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => load()}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                title="Refresh"
              >
                Refresh
              </button>
            </div>
          </div>

          {error ? (
            <div className="px-6 py-4">
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
            </div>
          ) : null}

          <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-gray-200 rounded p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Contract Overview</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500">Intent ID</dt>
                  <dd className="font-mono text-gray-900">
                    {contract?.intent_id ? (
                      <Link href={`/console/ingestion/intents/${encodeURIComponent(contract.intent_id)}`} className="text-blue-600 hover:text-blue-800 underline">
                        {contract.intent_id}
                      </Link>
                    ) : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Envelope ID</dt>
                  <dd className="font-mono text-gray-900">
                    {contract?.envelope_id ? (
                      <Link href={`/console/ingestion/raw-envelopes/${encodeURIComponent(contract.envelope_id)}`} className="text-blue-600 hover:text-blue-800 underline">
                        {contract.envelope_id}
                      </Link>
                    ) : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Tenant ID</dt>
                  <dd className="font-mono text-gray-900">{contract?.tenant_id || '-'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Contract Hash</dt>
                  <dd className="font-mono text-gray-900 flex items-center gap-2">
                    <span>{maskHash(contract?.contract_hash, hashExpanded)}</span>
                    {contract?.contract_hash ? (
                      <>
                        <button
                          onClick={() => navigator.clipboard.writeText(contract.contract_hash || '')}
                          className="px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50"
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => setHashExpanded((v) => !v)}
                          className="px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50"
                        >
                          {hashExpanded ? 'Mask' : 'Expand'}
                        </button>
                      </>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="bg-white border border-gray-200 rounded p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Lifecycle Timeline</h2>
              <div className="space-y-2">
                {lifecycle.map((s) => (
                  <div key={s.step} className="flex items-start gap-3">
                    <span className={`mt-0.5 ${s.done ? 'text-gray-900' : 'text-gray-400'}`}>{s.done ? '●' : '○'}</span>
                    <div className="flex-1">
                      <div className={`text-sm ${s.done ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>{s.step}</div>
                      <div className="text-xs text-gray-500 font-mono">
                        {s.step === 'ISSUED' && created ? created.toISOString() : '-'}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-500 mt-3">
                  Timeline is derived from current status (backend does not provide per-state timestamps yet).
                </p>
              </div>
            </section>
          </div>
        </div>

        <section className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Contract Payload (Read Only)</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPayloadExpanded((v) => !v)}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50"
              >
                {payloadExpanded ? 'Collapse' : 'Expand'}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(payload, null, 2))}
                disabled={payload == null}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Copy JSON
              </button>
            </div>
          </div>
          {payloadExpanded ? (
            <div className="px-6 py-4">
              <pre className="text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded p-4 overflow-x-auto">
{JSON.stringify(payload, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>

        <section className="bg-white border border-gray-200 rounded shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Linked Evidence</h2>
            <p className="text-xs text-gray-500 mt-1">
              Evidence navigation is intent-centric today. Use the intent link above to open evidence explorer.
            </p>
          </div>
          <div className="px-6 py-4 text-sm text-gray-700">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Intent: {contract?.intent_id ? (
                  <Link href={`/console/ingestion/intents/${encodeURIComponent(contract.intent_id)}`} className="text-blue-600 hover:text-blue-800 underline font-mono">
                    {contract.intent_id}
                  </Link>
                ) : '-'}
              </li>
              <li>
                Raw Envelope: {contract?.envelope_id ? (
                  <Link href={`/console/ingestion/raw-envelopes/${encodeURIComponent(contract.envelope_id)}`} className="text-blue-600 hover:text-blue-800 underline font-mono">
                    {contract.envelope_id}
                  </Link>
                ) : '-'}
              </li>
            </ul>
          </div>
        </section>
      </div>
    </Layout>
  )
}

