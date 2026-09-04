'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  fetchCustomerDlq,
  fetchCustomerIntents,
  formatRelativeAge,
  type CustomerDlqRow,
  type CustomerIntentRow,
} from '../_lib/customerProdApi'

type Priority = 'critical' | 'high' | 'medium' | 'low'
type WorkItemStatus = 'pending' | 'in_progress' | 'resolved'

interface WorkItem {
  id: string
  title: string
  description: string
  priority: Priority
  status: WorkItemStatus
  category: string
  age: string
  intentId?: string
}

function dlqToWorkItem(row: CustomerDlqRow, index: number): WorkItem {
  const replayable = row.replayable === true
  return {
    id: row.dlq_id || `dlq-${index}`,
    title: row.reason_code || 'DLQ item',
    description: row.error_detail || row.stage || 'Review required',
    priority: replayable ? 'medium' : 'high',
    status: 'pending',
    category: row.stage || 'DLQ',
    age: formatRelativeAge(row.created_at),
    intentId: row.envelope_id,
  }
}

function intentToWorkItem(row: CustomerIntentRow, index: number): WorkItem {
  const status = (row.status || '').toLowerCase()
  const stuck = status.includes('pending') || status.includes('failed')
  return {
    id: `intent-${row.intent_id || index}`,
    title: `Intent ${status || 'unknown'}`,
    description: `${row.intent_type || 'payment'} · ${row.currency || 'INR'}`,
    priority: status.includes('fail') ? 'high' : 'medium',
    status: 'pending',
    category: 'Intent',
    age: formatRelativeAge(row.created_at),
    intentId: row.intent_id,
  }
}

const priorityConfig: Record<Priority, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  high: { label: 'High', color: 'bg-cx-orange-50 text-cx-orange-700 border-cx-orange-200', dot: 'bg-cx-orange-500' },
  medium: { label: 'Medium', color: 'bg-cx-purple-50 text-cx-purple-700 border-cx-purple-200', dot: 'bg-cx-purple-500' },
  low: { label: 'Low', color: 'bg-gray-50 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
}

export default function WorkQueuePage() {
  const [filter, setFilter] = useState<'all' | Priority>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | WorkItemStatus>('all')
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [dlq, intents] = await Promise.all([
          fetchCustomerDlq(),
          fetchCustomerIntents({ page_size: 30 }),
        ])
        if (cancelled) return
        const fromDlq = dlq.map(dlqToWorkItem)
        const stuckIntents = intents.items
          .filter((i) => {
            const s = (i.status || '').toLowerCase()
            return s.includes('fail') || s.includes('pending')
          })
          .map(intentToWorkItem)
        setWorkItems([...fromDlq, ...stuckIntents])
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load work queue')
          setWorkItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = workItems.filter((item) => {
    if (filter !== 'all' && item.priority !== filter) return false
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    return true
  })

  const counts = useMemo(
    () => ({
      critical: workItems.filter((i) => i.priority === 'critical' && i.status !== 'resolved').length,
      high: workItems.filter((i) => i.priority === 'high' && i.status !== 'resolved').length,
      medium: workItems.filter((i) => i.priority === 'medium' && i.status !== 'resolved').length,
      low: workItems.filter((i) => i.priority === 'low' && i.status !== 'resolved').length,
    }),
    [workItems],
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Work Queue</h1>
          <p className="text-sm text-cx-neutral mt-0.5">
            Actionable items from DLQ and stuck intents (live `/api/prod/dlq`, `/api/prod/intents`)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {Object.entries(counts).map(([priority, count]) => (
              <span
                key={priority}
                className={`px-2 py-1 text-[10px] font-bold rounded-full border ${priorityConfig[priority as Priority].color}`}
              >
                {count} {priority}
              </span>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
      ) : null}
      {loading ? <p className="text-sm text-cx-neutral">Loading work queue…</p> : null}
      {!loading && workItems.length === 0 && !error ? (
        <p className="text-sm text-cx-neutral">No actionable items - DLQ and intent lists are empty.</p>
      ) : null}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                filter === f ? 'bg-white text-cx-text shadow-sm' : 'text-cx-neutral hover:text-cx-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-xs text-cx-neutral ml-auto">{filtered.length} items</span>
      </div>

      <div className="space-y-2">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-cx-purple-100 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${priorityConfig[item.priority].dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-cx-neutral">{item.id}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityConfig[item.priority].color}`}
                  >
                    {priorityConfig[item.priority].label}
                  </span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-cx-text">
                    {item.category}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-cx-text mt-1">{item.title}</h3>
                <p className="text-xs text-cx-neutral mt-0.5">{item.description}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-[10px] text-cx-neutral">{item.age} ago</span>
                  {item.intentId ? (
                    <Link
                      href={`/customer/intents/${encodeURIComponent(item.intentId)}`}
                      className="text-[10px] font-mono text-cx-purple-600 hover:underline"
                    >
                      {item.intentId}
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
