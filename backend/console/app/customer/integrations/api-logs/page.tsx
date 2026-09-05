'use client'

import { useEffect, useMemo, useState } from 'react'
import { MOCK_INTENT_IDS } from '../../mock'

interface ApiLog {
  id: string
  method: string
  path: string
  statusCode: number
  latency: string
  timestamp: string
  source: string
  requestSize: string
  responseSize: string
}

const logs: ApiLog[] = [
  { id: 'log_001', method: 'POST', path: '/v1/ingest', statusCode: 200, latency: '45ms', timestamp: '14:23:45.123', source: 'merchant-sdk', requestSize: '1.2 KB', responseSize: '0.3 KB' },
  { id: 'log_002', method: 'POST', path: '/v1/ingest', statusCode: 200, latency: '52ms', timestamp: '14:23:44.891', source: 'merchant-sdk', requestSize: '1.4 KB', responseSize: '0.3 KB' },
  { id: 'log_003', method: 'GET', path: `/v1/intents/${MOCK_INTENT_IDS[0]}`, statusCode: 200, latency: '12ms', timestamp: '14:23:44.500', source: 'merchant-dashboard', requestSize: '0.1 KB', responseSize: '2.1 KB' },
  { id: 'log_004', method: 'POST', path: '/v1/ingest', statusCode: 422, latency: '8ms', timestamp: '14:23:43.200', source: 'merchant-sdk', requestSize: '0.9 KB', responseSize: '0.4 KB' },
  { id: 'log_005', method: 'GET', path: '/v1/intents', statusCode: 200, latency: '78ms', timestamp: '14:23:42.100', source: 'merchant-dashboard', requestSize: '0.2 KB', responseSize: '12.4 KB' },
  { id: 'log_006', method: 'POST', path: '/v1/ingest', statusCode: 200, latency: '38ms', timestamp: '14:23:41.800', source: 'api-batch', requestSize: '8.2 KB', responseSize: '0.5 KB' },
  { id: 'log_007', method: 'POST', path: '/v1/ingest', statusCode: 401, latency: '3ms', timestamp: '14:23:40.500', source: 'unknown', requestSize: '1.1 KB', responseSize: '0.2 KB' },
  { id: 'log_008', method: 'GET', path: '/v1/health', statusCode: 200, latency: '2ms', timestamp: '14:23:40.000', source: 'health-check', requestSize: '0.0 KB', responseSize: '0.1 KB' },
]

const methodColors: Record<string, string> = {
  GET: 'bg-cx-teal-50 text-cx-teal-700',
  POST: 'bg-cx-purple-50 text-cx-purple-700',
  PUT: 'bg-cx-orange-50 text-cx-orange-700',
  DELETE: 'bg-red-50 text-red-700',
}

const PAGE_SIZE = 15

export default function ApiLogsPage() {
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [query, setQuery] = useState<string>('')
  const [activePage, setActivePage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(logs[0]?.id ?? null)

  const filtered = useMemo(() => {
    const base = methodFilter === 'all' ? logs : logs.filter(l => l.method === methodFilter)
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter((l) => `${l.path} ${l.source} ${l.method} ${l.statusCode}`.toLowerCase().includes(q))
  }, [methodFilter, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pagedLogs = useMemo(() => {
    const from = (activePage - 1) * PAGE_SIZE
    return filtered.slice(from, from + PAGE_SIZE)
  }, [activePage, filtered])
  const selected = filtered.find((log) => log.id === selectedId) || null

  useEffect(() => {
    setActivePage(1)
  }, [methodFilter, query])

  useEffect(() => {
    setActivePage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !filtered.some((row) => row.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">API Logs</h1>
        <p className="text-sm text-cx-neutral mt-0.5">Tenant-visible API request/response logs (simulated)</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Requests (1h)', value: '2,847', color: 'border-l-cx-purple-500' },
          { label: 'Success Rate', value: '99.2%', color: 'border-l-cx-teal-500' },
          { label: 'Avg Latency', value: '34ms', color: 'border-l-cx-purple-500' },
          { label: 'Error Count', value: '23', color: 'border-l-cx-orange-500' },
        ].map((s) => (
          <div key={s.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${s.color} p-4`}>
            <p className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-bold text-cx-text mt-1 tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {['all', 'GET', 'POST', 'PUT', 'DELETE'].map((m) => (
            <button
              key={m}
              onClick={() => setMethodFilter(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                methodFilter === m ? 'bg-white text-cx-text shadow-sm' : 'text-cx-neutral hover:text-cx-text'
              }`}
            >
              {m === 'all' ? 'All Methods' : m}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by path, status, or source..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-200 rounded-lg text-cx-text placeholder-gray-400 focus:ring-1 focus:ring-cx-purple-500 focus:border-cx-purple-500 outline-none"
          />
        </div>
        <span className="text-xs text-cx-neutral ml-auto">{filtered.length} rows</span>
      </div>

      {/* Logs Table */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        <div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Time</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Method</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Path</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Latency</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Source</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Req / Res</th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pagedLogs.map((log) => (
                <tr
                  key={log.id}
                  className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${selectedId === log.id ? 'bg-violet-50/50' : ''}`}
                  onClick={() => setSelectedId(log.id)}
                  title="View details"
                >
                  <td className="px-5 py-3 text-xs font-mono text-cx-neutral">{log.timestamp}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${methodColors[log.method] || 'bg-gray-100 text-gray-600'}`}>
                      {log.method}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-cx-text">{log.path}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-mono font-bold ${
                      log.statusCode < 300 ? 'text-cx-teal-600' :
                      log.statusCode < 500 ? 'text-cx-orange-600' :
                      'text-red-600'
                    }`}>
                      {log.statusCode}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-cx-neutral tabular-nums">{log.latency}</td>
                  <td className="px-5 py-3 text-xs text-cx-neutral">{log.source}</td>
                  <td className="px-5 py-3 text-xs text-cx-neutral tabular-nums">{log.requestSize} / {log.responseSize}</td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedId(log.id)
                      }}
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-cx-text hover:bg-gray-50"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
              {pagedLogs.length === 0 ? (
                <tr>
                  <td className="px-5 py-4 text-sm text-cx-neutral" colSpan={8}>
                    No logs found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-cx-neutral">
            <button
              onClick={() => setActivePage((prev) => Math.max(1, prev - 1))}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 disabled:opacity-40"
              disabled={activePage === 1}
            >
              Prev
            </button>
            <span>
              {activePage} / {totalPages}
            </span>
            <button
              onClick={() => setActivePage((prev) => Math.min(totalPages, prev + 1))}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 disabled:opacity-40"
              disabled={activePage === totalPages}
            >
              Next
            </button>
          </div>
        </div>

        <aside className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-cx-text">Request Detail</h3>
              <p className="text-xs text-cx-neutral mt-0.5">Click Inspect to view details</p>
            </div>
            {selected ? (
              <button
                onClick={() => setSelectedId(null)}
                className="text-xs font-semibold text-cx-purple-600 hover:text-cx-purple-700"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="p-5">
            {!selected ? (
              <div className="text-sm text-cx-neutral">
                No request selected.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${methodColors[selected.method] || 'bg-gray-100 text-gray-600'}`}>
                    {selected.method}
                  </span>
                  <span className="text-xs font-mono text-cx-text break-all">{selected.path}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Status</div>
                    <div className="mt-1 font-mono font-bold text-cx-text tabular-nums">{selected.statusCode}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Latency</div>
                    <div className="mt-1 font-mono font-bold text-cx-text tabular-nums">{selected.latency}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Source</div>
                    <div className="mt-1 text-cx-text">{selected.source}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Size</div>
                    <div className="mt-1 font-mono text-cx-text tabular-nums">{selected.requestSize} / {selected.responseSize}</div>
                  </div>
                </div>

                <details className="rounded-xl border border-gray-100 overflow-hidden" open>
                  <summary className="px-4 py-3 text-sm font-semibold text-cx-text cursor-pointer bg-white hover:bg-gray-50 transition-colors">
                    Request / Response
                  </summary>
                  <div className="px-4 py-3 border-t border-gray-100">
                    <div className="space-y-3">
                      <div className="rounded-lg border border-gray-100 overflow-hidden">
                        <div className="px-3 py-2 flex items-center justify-between bg-gray-50/60">
                          <div className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Request</div>
                          <span className="text-[10px] font-mono text-cx-neutral">
                            {selected.method} {selected.path}
                          </span>
                        </div>
                        <pre className="text-[11px] font-mono text-cx-neutral bg-white p-3 overflow-x-auto">
{JSON.stringify(
  {
    method: selected.method,
    path: selected.path,
    headers: {
      authorization: 'Bearer ***',
      'x-idempotency-key': 'idem_***',
      'content-type': 'application/json',
    },
    body:
      selected.method === 'POST'
        ? { schema_version: 'intent.request.v1', intent_type: 'FX', amount: { value: '1555.009', currency: 'INR' } }
        : null,
  },
  null,
  2
)}
                        </pre>
                      </div>

                      <div className="rounded-lg border border-gray-100 overflow-hidden">
                        <div className="px-3 py-2 flex items-center justify-between bg-gray-50/60">
                          <div className="text-[10px] font-semibold text-cx-neutral uppercase tracking-wider">Response</div>
                          <span className="text-[10px] font-mono text-cx-neutral">HTTP {selected.statusCode}</span>
                        </div>
                        <pre className="text-[11px] font-mono text-cx-neutral bg-white p-3 overflow-x-auto">
{JSON.stringify(
  selected.statusCode < 300
    ? { success: true }
    : { success: false, error: { code: selected.statusCode === 401 ? 'UNAUTHORIZED' : 'VALIDATION_FAILED', message: 'Request rejected' } },
  null,
  2
)}
                        </pre>
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
