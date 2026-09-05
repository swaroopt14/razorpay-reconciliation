'use client'

import { useMemo, useState } from 'react'
import { API_LOGS } from '../../sandbox-fixtures'

export default function ApiLogsViewerPage() {
  const [statusCodeFilter, setStatusCodeFilter] = useState('all')
  const [endpointFilter, setEndpointFilter] = useState('all')
  const [idempotencyFilter, setIdempotencyFilter] = useState('')
  const [errorCodeFilter, setErrorCodeFilter] = useState('all')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0)

  const endpointOptions = useMemo(() => Array.from(new Set(API_LOGS.map((log) => log.endpoint))), [])
  const errorOptions = useMemo(() => Array.from(new Set(API_LOGS.map((log) => log.errorCode))), [])

  const filteredLogs = useMemo(() => {
    return API_LOGS.filter((log) => {
      if (statusCodeFilter !== 'all') {
        if (statusCodeFilter === '2xx' && log.statusCode >= 300) return false
        if (statusCodeFilter === '4xx' && (log.statusCode < 400 || log.statusCode > 499)) return false
        if (statusCodeFilter === '5xx' && (log.statusCode < 500 || log.statusCode > 599)) return false
      }
      if (endpointFilter !== 'all' && log.endpoint !== endpointFilter) return false
      if (errorCodeFilter !== 'all' && log.errorCode !== errorCodeFilter) return false
      if (idempotencyFilter && !log.idempotencyKey.toLowerCase().includes(idempotencyFilter.toLowerCase())) return false
      return true
    })
  }, [statusCodeFilter, endpointFilter, errorCodeFilter, idempotencyFilter])

  const selectedLog = selectedIndex == null ? null : filteredLogs[selectedIndex] || null

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">API Logs Viewer</h1>
        <p className="mt-0.5 text-sm text-cx-neutral">
          Request/response logs with masked headers and ID-first trace links.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={statusCodeFilter}
            onChange={(event) => setStatusCodeFilter(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-cx-purple-500"
          >
            <option value="all">status_code: all</option>
            <option value="2xx">status_code: 2xx</option>
            <option value="4xx">status_code: 4xx</option>
            <option value="5xx">status_code: 5xx</option>
          </select>

          <select
            value={endpointFilter}
            onChange={(event) => setEndpointFilter(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-cx-purple-500"
          >
            <option value="all">endpoint: all</option>
            {endpointOptions.map((endpoint) => (
              <option key={endpoint} value={endpoint}>
                {endpoint}
              </option>
            ))}
          </select>

          <input
            value={idempotencyFilter}
            onChange={(event) => setIdempotencyFilter(event.target.value)}
            placeholder="idempotency_key"
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-cx-purple-500"
          />

          <select
            value={errorCodeFilter}
            onChange={(event) => setErrorCodeFilter(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-cx-purple-500"
          >
            <option value="all">error_code: all</option>
            {errorOptions.map((errorCode) => (
              <option key={errorCode} value={errorCode}>
                {errorCode}
              </option>
            ))}
          </select>

          <input type="date" className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-cx-purple-500" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/70">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">timestamp</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">method + endpoint</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">status</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">trace_id</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">envelope_id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredLogs.map((log, index) => (
                <tr
                  key={`${log.timestamp}_${log.traceId}`}
                  onClick={() => setSelectedIndex(index)}
                  className={`cursor-pointer hover:bg-gray-50/60 ${selectedIndex === index ? 'bg-violet-50/50' : ''}`}
                >
                  <td className="px-3 py-2 text-xs text-cx-neutral">{new Date(log.timestamp).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-xs font-mono text-cx-text">
                    {log.method} {log.endpoint}
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold text-cx-text">{log.statusCode}</td>
                  <td className="px-3 py-2 text-xs font-mono text-cx-text">{log.traceId}</td>
                  <td className="px-3 py-2 text-xs font-mono text-cx-neutral">{log.envelopeId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-cx-text">Log Detail</h2>
          {selectedLog ? (
            <div className="mt-3 space-y-2 text-xs">
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
                <p className="font-semibold text-cx-neutral">idempotency_key</p>
                <p className="mt-1 font-mono text-cx-text">{selectedLog.idempotencyKey}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
                <p className="font-semibold text-cx-neutral">request headers (masked)</p>
                <pre className="mt-1 overflow-auto font-mono text-[11px] text-cx-text">
{`{
  "authorization": "Bearer ***",
  "x-idempotency-key": "${selectedLog.idempotencyKey}",
  "x-tenant-id": "demo-merchant-in",
  "x-user-token": "usr_tok_***"
}`}
                </pre>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
                <p className="font-semibold text-cx-neutral">request body (tokenized)</p>
                <pre className="mt-1 overflow-auto font-mono text-[11px] text-cx-text">
{`{
  "beneficiary_account_token": "acct_tok_***",
  "beneficiary_name_token": "name_tok_***",
  "amount": { "value": "12500.00", "currency": "INR" }
}`}
                </pre>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-cx-neutral">Select a row to inspect details.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
