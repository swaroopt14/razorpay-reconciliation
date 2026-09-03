'use client'

import Link from 'next/link'
import { useState } from 'react'
import { WORK_QUEUE_ITEMS } from '../sandbox-fixtures'

type FilterStatus = 'All' | 'Open' | 'In Progress' | 'Dismissed'

export default function CustomerWorkQueuePage() {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('All')

  const filtered = WORK_QUEUE_ITEMS.filter((item) => (statusFilter === 'All' ? true : item.status === statusFilter))

  const dismissItem = (id: string) => {
    window.dispatchEvent(
      new CustomEvent('cx:toast', {
        detail: {
          type: 'info',
          title: 'Dismissed (simulated)',
          desc: `Queue item ${id} moved to Dismissed with audit comment.`,
        },
      })
    )
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Actionable Queue</h1>
          <p className="mt-0.5 text-sm text-cx-neutral">
            Low-confidence intents, SLA risk, DLQ entries, webhook failures, and fusion conflicts.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as FilterStatus)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-cx-purple-500"
        >
          <option value="All">All status</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Dismissed">Dismissed</option>
        </select>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">severity</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">status</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">intent_id / envelope_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">reason_code</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">age</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      item.severity === 'Critical'
                        ? 'bg-red-50 text-red-700'
                        : item.severity === 'High'
                          ? 'bg-amber-50 text-amber-700'
                          : item.severity === 'Medium'
                            ? 'bg-violet-50 text-violet-700'
                            : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {item.severity}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-cx-text">{item.status}</td>
                <td className="px-4 py-3 text-xs font-mono text-cx-text">{item.targetId}</td>
                <td className="px-4 py-3 text-xs font-mono text-cx-neutral">{item.reasonCode}</td>
                <td className="px-4 py-3 text-xs text-cx-neutral">{item.age}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={item.reasonCode.includes('DLQ') ? '/customer/sandbox/exceptions' : `/customer/sandbox/intents/${encodeURIComponent(item.targetId)}`}
                      className="rounded-lg border border-cx-purple-200 bg-cx-purple-50 px-2.5 py-1 text-[11px] font-semibold text-cx-purple-700"
                    >
                      Investigate
                    </Link>
                    <Link
                      href={`/customer/sandbox/intents/replay?prefill=${encodeURIComponent(item.targetId)}`}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-cx-text"
                    >
                      Replay
                    </Link>
                    <button
                      onClick={() => dismissItem(item.id)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-cx-neutral"
                    >
                      Dismiss
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-cx-neutral">No items for current filter.</div>
        ) : null}
      </section>
    </div>
  )
}
