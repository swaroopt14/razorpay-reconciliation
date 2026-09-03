'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { getIntentById, STATUS_DEFINITIONS } from '../../sandbox-fixtures'

export default function CustomerIntentDetailPage() {
  const params = useParams()
  const intentId = decodeURIComponent(String(params.intentId || ''))
  const [verifyState, setVerifyState] = useState<'idle' | 'running' | 'valid'>('idle')

  const intent = useMemo(() => getIntentById(intentId), [intentId])

  if (!intent) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          Intent `{intentId}` not found in simulation dataset.
        </div>
      </div>
    )
  }

  const runVerify = () => {
    setVerifyState('running')
    window.setTimeout(() => setVerifyState('valid'), 700)
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-2 text-xs text-cx-neutral">
        <Link href="/customer/sandbox/intents" className="hover:text-cx-purple-700">
          Intent Journal
        </Link>
        <span>›</span>
        <span className="font-mono text-cx-text">{intent.intentId}</span>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">intent_id</p>
            <p className="mt-1 break-all font-mono text-sm text-cx-text">{intent.intentId}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">envelope_id</p>
            <p className="mt-1 break-all font-mono text-sm text-cx-text">{intent.envelopeId}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">trace_id</p>
            <p className="mt-1 break-all font-mono text-sm text-cx-text">{intent.traceId}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">tenant_id</p>
            <p className="mt-1 text-sm font-medium text-cx-text">{intent.tenantId}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">schema_version</p>
            <p className="mt-1 font-mono text-sm text-cx-text">{intent.schemaVersion}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">canonical_hash</p>
            <p className="mt-1 break-all font-mono text-xs text-cx-text">{intent.canonicalHash}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-cx-text">Replay count: {intent.replayCount}</span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">Replay-safe: no live fund movement</span>
          <span className="rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-700" title={STATUS_DEFINITIONS[intent.status]}>
            {intent.status}
          </span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <section className="rounded-2xl border border-gray-100 bg-white">
          <header className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-cx-text">Canonical Intent (Tokenized JSON)</h2>
            <p className="text-xs text-cx-neutral">All sensitive fields are token references.</p>
          </header>
          <pre className="overflow-auto px-4 py-3 text-xs font-mono text-cx-text">
            {JSON.stringify(intent.canonicalIntent, null, 2)}
          </pre>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white">
          <header className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-cx-text">Confidence + Validation</h2>
          </header>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/70">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Field</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Source</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Transform</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Confidence</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {intent.validationRows.map((row) => (
                <tr key={row.ruleId}>
                  <td className="px-3 py-2 text-xs text-cx-text">{row.field}</td>
                  <td className="px-3 py-2 text-xs text-cx-neutral">{row.source}</td>
                  <td className="px-3 py-2 text-xs text-cx-neutral">{row.transform}</td>
                  <td className="px-3 py-2 text-xs font-semibold text-cx-text">{(row.confidence * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2 text-xs font-mono text-cx-purple-700">{row.ruleId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <header className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-cx-text">Status Timeline</h2>
        </header>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Status</th>
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Timestamp</th>
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Duration</th>
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Retries</th>
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Rule IDs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {intent.timeline.map((step) => (
              <tr key={`${step.status}_${step.timestamp}`}>
                <td className="px-4 py-2 text-xs font-semibold text-cx-text">{step.status}</td>
                <td className="px-4 py-2 text-xs text-cx-neutral">{new Date(step.timestamp).toLocaleString('en-IN')}</td>
                <td className="px-4 py-2 text-xs tabular-nums text-cx-text">{step.durationMs} ms</td>
                <td className="px-4 py-2 text-xs text-cx-text">{step.retryCount}</td>
                <td className="px-4 py-2 text-xs font-mono text-cx-neutral">{step.ruleIds.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-cx-text">Related Evidence</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <span className="rounded-full bg-gray-100 px-2.5 py-1 font-mono text-cx-text">evidence_pack_id: {intent.evidencePackId}</span>
          <Link
            href={`/customer/sandbox/evidence/explorer?intent_id=${encodeURIComponent(intent.intentId)}`}
            className="rounded-lg border border-cx-purple-200 bg-cx-purple-50 px-3 py-1.5 font-semibold text-cx-purple-700 hover:bg-cx-purple-100"
          >
            Open Evidence Explorer
          </Link>
          <button
            onClick={runVerify}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-cx-text hover:bg-gray-50"
          >
            {verifyState === 'running' ? 'Verifying...' : verifyState === 'valid' ? 'Proof: VALID' : 'Verify Proof'}
          </button>
        </div>
      </section>
    </div>
  )
}
