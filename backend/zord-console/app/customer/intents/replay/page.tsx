'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  fetchCustomerDlq,
  fetchCustomerIntents,
  formatInrAmount,
  formatRelativeAge,
  type CustomerIntentRow,
} from '../../_lib/customerProdApi'

interface ReplayCandidate {
  id: string
  intentId: string
  type: string
  amount: string
  failureReason: string
  failedAt: string
  attempts: number
  canAutoRetry: boolean
  needsApproval: boolean
  state?: 'ready' | 'replaying' | 'replayed'
}

function toCandidate(row: CustomerIntentRow, index: number, reason: string): ReplayCandidate {
  const status = (row.status || '').toLowerCase()
  return {
    id: `RPL-${row.intent_id || index}`,
    intentId: row.intent_id,
    type: row.intent_type || 'payment',
    amount: formatInrAmount(row.amount, row.currency),
    failureReason: reason,
    failedAt: formatRelativeAge(row.created_at),
    attempts: 0,
    canAutoRetry: !status.includes('reject'),
    needsApproval: status.includes('payout'),
    state: 'ready',
  }
}

export default function ReplayCenter() {
  const [items, setItems] = useState<ReplayCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [intents, dlq] = await Promise.all([
          fetchCustomerIntents({ page_size: 50 }),
          fetchCustomerDlq(),
        ])
        if (cancelled) return
        const failedIntents = intents.items
          .filter((i) => {
            const s = (i.status || '').toLowerCase()
            return s.includes('fail') || s.includes('pending') || s.includes('stuck')
          })
          .map((row, i) => toCandidate(row, i, `Status: ${row.status || 'unknown'}`))
        const fromDlq = dlq
          .filter((d) => d.replayable !== false)
          .map((row, i) =>
            toCandidate(
              { intent_id: row.envelope_id || row.dlq_id, created_at: row.created_at },
              i,
              row.error_detail || row.reason_code || 'DLQ',
            ),
          )
        setItems([...failedIntents, ...fromDlq].slice(0, 40))
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load replay candidates')
          setItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const pushToast = (title: string, desc?: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    window.dispatchEvent(new CustomEvent('cx:toast', { detail: { title, desc, type } }))
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  const selectAll = () => {
    if (selected.length === items.length) setSelected([])
    else setSelected(items.map((c) => c.id))
  }

  const selectedReplayable = useMemo(() => {
    const map = new Map(items.map((i) => [i.id, i]))
    return selected.map((id) => map.get(id)).filter(Boolean) as ReplayCandidate[]
  }, [selected, items])

  const simulateReplay = async (ids: string[]) => {
    if (!ids.length) return
    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, state: 'replaying' } : it)))
    pushToast('Replay started', `Replaying ${ids.length} intent(s)…`, 'info')
    await new Promise((r) => setTimeout(r, 1100))
    setItems((prev) =>
      prev.map((it) => {
        if (!ids.includes(it.id)) return it
        return { ...it, state: 'replayed', attempts: it.attempts + 1 }
      }),
    )
    pushToast('Replay queued', 'Watch DLQ / Intent Journal for updates.', 'success')
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-xs text-cx-neutral">
        <Link href="/customer/intents" className="hover:text-cx-purple-600 transition-colors">
          Intents
        </Link>
        <span>›</span>
        <span className="text-cx-text font-medium">Retry / Replay Center</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Retry / Replay Center</h1>
          <p className="text-sm text-cx-neutral mt-0.5">
            Candidates from `/api/prod/intents` (failed/pending) and `/api/prod/dlq` (replayable).
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
      ) : null}
      {loading ? <p className="text-sm text-cx-neutral">Loading replay candidates…</p> : null}
      {!loading && items.length === 0 && !error ? (
        <p className="text-sm text-cx-neutral">No replay candidates in the current tenant window.</p>
      ) : null}

      {!loading && items.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={selectAll}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 bg-white"
            >
              {selected.length === items.length ? 'Deselect all' : 'Select all'}
            </button>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => setShowConfirm(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cx-purple-600 text-white disabled:opacity-50"
            >
              Replay selected ({selected.length})
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => toggleSelect(item.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/customer/intents/${encodeURIComponent(item.intentId)}`}
                      className="font-mono text-xs text-cx-purple-600 hover:underline"
                    >
                      {item.intentId}
                    </Link>
                    <span className="text-xs text-cx-neutral">{item.state}</span>
                  </div>
                  <p className="text-sm font-medium text-cx-text mt-1">{item.failureReason}</p>
                  <p className="text-xs text-cx-neutral mt-0.5">
                    {item.type} · {item.amount} · {item.failedAt} ago
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {showConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-cx-text">Confirm replay</h2>
            <p className="mt-2 text-sm text-cx-neutral">
              Replay {selectedReplayable.length} candidate(s)? This queues a client-side simulation until replay API
              ships.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConfirm(false)} className="px-3 py-2 text-sm border rounded-lg">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false)
                  void simulateReplay(selected)
                }}
                className="px-3 py-2 text-sm rounded-lg bg-cx-purple-600 text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
