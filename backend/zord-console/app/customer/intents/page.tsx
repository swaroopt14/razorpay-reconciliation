'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'

type IntentStatus = string

type BackendIntentRow = {
  intent_id: string
  envelope_id?: string
  tenant_id?: string
  source?: string
  intent_type?: string
  amount?: string | number
  currency?: string
  instrument?: string
  status?: IntentStatus
  created_at?: string
}

function safeDate(value?: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export default function CustomerIntentJournalPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<BackendIntentRow[]>([])

  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(pageSize))
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await fetch(`/api/prod/intents?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load intents: ${res.status}`)

      const data = await res.json()
      setItems(data.items || [])
      setTotal(data.pagination?.total || 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load intents')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page, pageSize])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => {
      const a = (i.intent_id || '').toLowerCase()
      const b = (i.envelope_id || '').toLowerCase()
      return a.includes(q) || b.includes(q)
    })
  }, [items, search])

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) if (i.status) set.add(i.status)
    return Array.from(set).sort()
  }, [items])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Intent Journal</h1>
          <p className="text-sm text-cx-neutral mt-0.5">Canonical intents (read-only), backed by intent-engine</p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1.5 text-xs font-semibold bg-white text-cx-text border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by intent_id or envelope_id..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
        >
          <option value="all">All statuses</option>
          {uniqueStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={String(pageSize)}
          onChange={(e) => {
            setPageSize(parseInt(e.target.value, 10))
            setPage(1)
          }}
          className="text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-cx-text focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
        >
          <option value="25">25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50">
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Intent ID</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Type</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Amount</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Currency</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Created</th>
              <th className="px-5 py-3 text-right text-[10px] font-semibold text-cx-neutral uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-sm text-cx-neutral">Loading…</td>
              </tr>
            ) : (
              filtered.map((i) => {
                const created = safeDate(i.created_at)
                return (
                  <tr key={i.intent_id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/customer/intents/${encodeURIComponent(i.intent_id)}`} className="text-sm font-mono text-cx-purple-600 hover:text-cx-purple-700 hover:underline">
                        {i.intent_id}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{i.intent_type || i.source || '-'}</td>
                    <td className="px-5 py-3 text-sm font-mono font-medium text-cx-text tabular-nums">{i.amount ?? '-'}</td>
                    <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{i.currency || '-'}</td>
                    <td className="px-5 py-3">
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-cx-text">
                        {i.status || '-'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-cx-neutral">
                      {created ? format(created, 'yyyy-MM-dd HH:mm:ss') : '-'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/customer/intents/${encodeURIComponent(i.intent_id)}`}
                        className="text-xs font-semibold text-cx-purple-600 hover:text-cx-purple-700"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {!loading && filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-cx-neutral">No intents found</p>
          </div>
        ) : null}

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="text-xs text-cx-neutral">
            {total ? (
              <>
                Page <span className="font-semibold text-cx-text">{page}</span> of{' '}
                <span className="font-semibold text-cx-text">{Math.max(1, Math.ceil(total / pageSize))}</span> ({total} total)
              </>
            ) : (
              <>Page <span className="font-semibold text-cx-text">{page}</span></>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 text-xs font-semibold bg-white text-cx-text border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Prev
            </button>
            <button
              disabled={loading || (total ? page >= Math.ceil(total / pageSize) : items.length < pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-xs font-semibold bg-white text-cx-text border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
