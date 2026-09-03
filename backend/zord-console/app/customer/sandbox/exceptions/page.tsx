'use client'

import Link from 'next/link'
import { EXCEPTION_ROWS } from '../sandbox-fixtures'

export default function CustomerExceptionsPage() {
  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-bold text-cx-text">Exceptions View</h1>
        <p className="mt-0.5 text-sm text-cx-neutral">
          Deterministic exception vocabulary and retry metadata for audit and incident handling.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">reason_code</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">stage</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">retryable</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">first_seen_at</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">last_seen_at</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">intent_id / envelope_id</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {EXCEPTION_ROWS.map((row) => (
              <tr key={`${row.reasonCode}_${row.intentId}`} className="hover:bg-gray-50/60">
                <td className="px-4 py-3 text-xs font-mono text-cx-text">{row.reasonCode}</td>
                <td className="px-4 py-3 text-xs text-cx-text">{row.stage}</td>
                <td className="px-4 py-3 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${row.retryable ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                    {row.retryable ? 'yes' : 'no'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-cx-neutral">{new Date(row.firstSeenAt).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-xs text-cx-neutral">{new Date(row.lastSeenAt).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-xs">
                  <div className="space-y-1">
                    <Link href={`/customer/sandbox/intents/${encodeURIComponent(row.intentId)}`} className="block font-mono text-cx-purple-700 hover:underline">
                      {row.intentId}
                    </Link>
                    <span className="block font-mono text-cx-neutral">{row.envelopeId}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
