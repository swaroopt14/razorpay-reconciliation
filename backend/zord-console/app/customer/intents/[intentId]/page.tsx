'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { format } from 'date-fns'

type IntentDetail = {
  intent_id: string
  status?: string
  source?: string
  canonical?: {
    intent_type?: string
    amount?: { value?: string | number; currency?: string }
    instrument?: { kind?: string }
    constraints?: Record<string, unknown>
  }
  evidence?: {
    raw_envelope_id?: string
    canonical_snapshot?: string
    outbox_event_id?: string
  }
  beneficiary?: unknown
  pii_tokens?: unknown
  deadline_at?: string
  created_at?: string
}

function safeDate(value?: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function CustomerIntentDetailPage() {
  const params = useParams()
  const intentId = params.intentId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<IntentDetail | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/prod/intents/${encodeURIComponent(intentId)}`, { cache: 'no-store' })
        if (res.status === 404) {
          setDetail(null)
          setError('Intent not found')
          return
        }
        if (!res.ok) throw new Error(`Failed to load intent: ${res.status}`)
        const data = await res.json()
        setDetail(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load intent')
        setDetail(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [intentId])

  const created = safeDate(detail?.created_at)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-xs text-cx-neutral">
        <Link href="/customer/intents" className="hover:text-cx-purple-600 transition-colors">Intent Journal</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-cx-text font-medium font-mono">{intentId}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-cx-text font-mono">{intentId}</h1>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-cx-text">
              {detail?.status || (loading ? 'Loading' : 'Unknown')}
            </span>
          </div>
          <p className="text-sm text-cx-neutral mt-1">
            {detail?.source || detail?.canonical?.intent_type || 'Intent'}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Amount', value: detail?.canonical?.amount?.value ?? '-', mono: true },
          { label: 'Currency', value: detail?.canonical?.amount?.currency ?? '-', mono: false },
          { label: 'Instrument', value: detail?.canonical?.instrument?.kind ?? '-', mono: false },
          { label: 'Envelope ID', value: detail?.evidence?.raw_envelope_id ?? '-', mono: true },
          { label: 'Deadline', value: detail?.deadline_at ?? '-', mono: false },
          { label: 'Created', value: created ? format(created, 'yyyy-MM-dd HH:mm:ss') : '-', mono: false },
          { label: 'Status', value: detail?.status ?? '-', mono: false },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">{item.label}</p>
            <p className={`text-sm font-medium text-cx-text mt-1 ${item.mono ? 'font-mono' : ''} truncate`}>
              {String(item.value)}
            </p>
          </div>
        ))}
      </div>

      <details className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-cx-text hover:bg-gray-50 transition-colors">
          Intent Detail (JSON)
        </summary>
        <div className="px-5 py-4 border-t border-gray-100">
          <pre className="text-xs font-mono text-cx-neutral bg-gray-50 p-4 rounded-lg overflow-x-auto">
{JSON.stringify(detail || { intent_id: intentId }, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  )
}
