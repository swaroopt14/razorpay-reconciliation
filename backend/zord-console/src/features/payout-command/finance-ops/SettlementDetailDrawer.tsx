'use client'

import { useEffect, useState } from 'react'
import { getSettlementReconCombined } from '@/services/payout-command/prod-api/financeApi'
import type {
  RazorpaySettlement,
  RazorpaySettlementReconLine,
} from '@/services/payout-command/prod-api/financeTypes'
import { formatPaise } from './reasonCopy'
import { StatusBadge } from './razorpayChrome'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-b border-[#F1F5F9] py-2 text-[13px]">
      <dt className="text-[#64748B]">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-[#0F172A]">{children || '—'}</dd>
    </div>
  )
}

function formatUnix(ts?: number | null) {
  if (ts == null || !Number.isFinite(ts)) return '—'
  const d = new Date(ts * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function settlementTone(status: string): 'captured' | 'pending' | 'failed' | 'created' {
  const s = status.toLowerCase()
  if (s === 'processed') return 'captured'
  if (s === 'failed') return 'failed'
  if (s === 'created' || s === 'initiated') return 'pending'
  return 'created'
}

export function SettlementDetailDrawer({
  settlement,
  onClose,
}: {
  settlement: RazorpaySettlement
  onClose: () => void
}) {
  const [lines, setLines] = useState<RazorpaySettlementReconLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void getSettlementReconCombined(settlement.id).then((res) => {
      if (cancelled) return
      if (!res.ok || !res.data) {
        setError('Could not load settlement recon breakdown.')
        setLines([])
        setLoading(false)
        return
      }
      setLines(res.data.items ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [settlement.id])

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[480px] flex-col border-l border-[#E2E8F0] bg-white shadow-[-8px_0_24px_rgba(15,23,42,0.08)]"
      aria-label="Settlement details"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
            Settlement Id
          </p>
          <h2 className="mt-1 break-all font-mono text-[15px] font-semibold text-[#0F172A]">
            {settlement.id}
          </h2>
          <p className="mt-2 text-[22px] font-semibold tabular-nums tracking-tight text-[#0F172A]">
            {formatPaise(settlement.amount)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 shrink-0 px-2 text-[18px] leading-none text-[#64748B] hover:text-[#0F172A]"
          aria-label="Close settlement details"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-4">
          <StatusBadge tone={settlementTone(settlement.status)}>{settlement.status}</StatusBadge>
        </div>

        <section>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
            Settlement details
          </h3>
          <dl>
            <Field label="Entity">{settlement.entity || 'settlement'}</Field>
            <Field label="Amount">{formatPaise(settlement.amount)}</Field>
            <Field label="Fees">{formatPaise(settlement.fees || 0)}</Field>
            <Field label="Tax">{formatPaise(settlement.tax || 0)}</Field>
            <Field label="UTR">{settlement.utr || '—'}</Field>
            <Field label="Created at">{formatUnix(settlement.created_at)}</Field>
            <Field label="Items">{settlement.items_count ?? lines.length}</Field>
          </dl>
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
            Settlement recon · combined
          </h3>
          <p className="mb-3 text-[12px] text-[#64748B]">
            Transaction-level evidence from <span className="font-mono">/v1/settlements/recon/combined</span>
          </p>

          {loading ? (
            <p className="text-[13px] text-[#64748B]">Loading recon lines…</p>
          ) : error ? (
            <p className="text-[13px] text-[#B91C1C]">{error}</p>
          ) : lines.length === 0 ? (
            <p className="text-[13px] text-[#64748B]">No recon lines for this settlement.</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <li
                  key={`${line.entity_id}-${line.type}-${line.created_at}`}
                  className="rounded-[8px] border border-[#EEF0F3] bg-[#FAFBFC] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-[12px] font-semibold text-[#0F172A]">{line.entity_id}</p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-[#94A3B8]">
                        {line.type}
                        {line.method ? ` · ${line.method}` : ''}
                      </p>
                    </div>
                    <p className="text-[13px] font-semibold tabular-nums text-[#0F172A]">
                      {formatPaise(line.amount)}
                    </p>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                    <div>
                      <span className="text-[#94A3B8]">Credit </span>
                      <span className="tabular-nums text-[#0F172A]">{formatPaise(line.credit || 0)}</span>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Debit </span>
                      <span className="tabular-nums text-[#0F172A]">{formatPaise(line.debit || 0)}</span>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Fee </span>
                      <span className="tabular-nums text-[#0F172A]">{formatPaise(line.fee || 0)}</span>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Tax </span>
                      <span className="tabular-nums text-[#0F172A]">{formatPaise(line.tax || 0)}</span>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">On hold </span>
                      <span className="text-[#0F172A]">{line.on_hold ? 'yes' : 'no'}</span>
                    </div>
                    <div>
                      <span className="text-[#94A3B8]">Settled </span>
                      <span className="text-[#0F172A]">{line.settled ? 'yes' : 'no'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[#94A3B8]">UTR </span>
                      <span className="font-mono text-[#0F172A]">{line.settlement_utr || '—'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[#94A3B8]">Order </span>
                      <span className="font-mono text-[#0F172A]">{line.order_id || '—'}</span>
                    </div>
                    <div className="col-span-2 text-[#64748B]">{line.description || '—'}</div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  )
}
