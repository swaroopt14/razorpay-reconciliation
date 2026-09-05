'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { SANDBOX_INTENTS, STATUS_DEFINITIONS } from '../sandbox-fixtures'

const statusOptions = [
  'RECEIVED',
  'CANONICALIZED',
  'READY_FOR_RELAY',
  'RELAYED',
  'OUTCOME_RECEIVED',
  'FUSED_SUCCESS',
  'EXCEPTION',
  'DLQ',
] as const

export default function CustomerIntentJournalPage() {
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [minAmount, setMinAmount] = useState<number>(0)
  const [maxAmount, setMaxAmount] = useState<number>(100000)
  const [minConfidence, setMinConfidence] = useState<number>(0.7)
  const [schemaVersion, setSchemaVersion] = useState<string>('all')
  const [replayed, setReplayed] = useState<'all' | 'yes' | 'no'>('all')

  const schemaOptions = useMemo(() => Array.from(new Set(SANDBOX_INTENTS.map((item) => item.schemaVersion))), [])

  const filtered = useMemo(() => {
    return SANDBOX_INTENTS.filter((intent) => {
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(intent.status)) return false
      if (intent.amount < minAmount || intent.amount > maxAmount) return false
      if (intent.confidence < minConfidence) return false
      if (schemaVersion !== 'all' && intent.schemaVersion !== schemaVersion) return false
      if (replayed === 'yes' && !intent.replayed) return false
      if (replayed === 'no' && intent.replayed) return false
      return true
    })
  }, [selectedStatuses, minAmount, maxAmount, minConfidence, schemaVersion, replayed])

  const toggleStatus = (status: string) => {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
    )
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Intent Journal</h1>
          <p className="mt-0.5 text-sm text-cx-neutral">
            Tokenized, deterministic intent records with trace and replay metadata.
          </p>
        </div>
        <Link
          href="/customer/sandbox/intents/replay"
          className="rounded-lg border border-cx-purple-200 bg-cx-purple-50 px-3 py-2 text-xs font-semibold text-cx-purple-700 hover:bg-cx-purple-100"
        >
          Open Replay Simulation
        </Link>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    selectedStatuses.includes(status)
                      ? 'border-cx-purple-300 bg-cx-purple-100 text-cx-purple-700'
                      : 'border-gray-200 bg-gray-50 text-cx-neutral'
                  }`}
                  title={STATUS_DEFINITIONS[status]}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Amount range (INR)</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={minAmount}
                  onChange={(event) => setMinAmount(Number(event.target.value))}
                  className="rounded-lg border border-gray-200 px-2.5 py-2 text-sm outline-none focus:border-cx-purple-500"
                />
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(event) => setMaxAmount(Number(event.target.value))}
                  className="rounded-lg border border-gray-200 px-2.5 py-2 text-sm outline-none focus:border-cx-purple-500"
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Confidence threshold</p>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.01}
                value={minConfidence}
                onChange={(event) => setMinConfidence(Number(event.target.value))}
                className="w-full"
              />
              <p className="text-xs text-cx-neutral">≥ {(minConfidence * 100).toFixed(0)}%</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Schema version</p>
              <select
                value={schemaVersion}
                onChange={(event) => setSchemaVersion(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm outline-none focus:border-cx-purple-500"
              >
                <option value="all">All</option>
                {schemaOptions.map((version) => (
                  <option key={version} value={version}>
                    {version}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">Replayed</p>
              <select
                value={replayed}
                onChange={(event) => setReplayed(event.target.value as 'all' | 'yes' | 'no')}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm outline-none focus:border-cx-purple-500"
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">intent_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">envelope_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">trace_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">status</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">amount</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">confidence</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">created_at</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">schema</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((intent) => (
              <tr key={intent.intentId} className="hover:bg-gray-50/60">
                <td className="px-4 py-3 text-xs font-mono text-cx-purple-700">
                  <Link href={`/customer/sandbox/intents/${encodeURIComponent(intent.intentId)}`} className="hover:underline">
                    {intent.intentId}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-cx-text">{intent.envelopeId}</td>
                <td className="px-4 py-3 text-xs font-mono text-cx-text">{intent.traceId}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-cx-text" title={STATUS_DEFINITIONS[intent.status]}>
                    {intent.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-semibold tabular-nums text-cx-text">₹{intent.amount.toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-xs text-cx-text">{(intent.confidence * 100).toFixed(0)}%</td>
                <td className="px-4 py-3 text-xs text-cx-neutral">{new Date(intent.createdAt).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-xs font-mono text-cx-neutral">{intent.schemaVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-cx-neutral">No intents matched current filters.</div>
        ) : null}
      </section>
    </div>
  )
}
