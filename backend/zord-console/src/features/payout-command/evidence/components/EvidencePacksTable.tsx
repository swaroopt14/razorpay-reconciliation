'use client'

import Link from 'next/link'
import type { PackTableRowVm } from '../types/evidenceViewModels'
import { formatEvidenceDate } from '../utils/evidenceFormat'

function statusClass(key: PackTableRowVm['proofStatusKey']): string {
  if (key === 'proofReady' || key === 'verified' || key === 'exported') {
    return 'bg-neutral-100 text-black'
  }
  if (key === 'needsReview') return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

type Props = {
  rows: PackTableRowVm[]
  loading?: boolean
  error?: string | null
}

export function EvidencePacksTable({ rows, loading, error }: Props) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-[14px] font-semibold text-slate-900">Evidence Packs</h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="pb-2.5 pr-3">Pack</th>
              <th className="pb-2.5 pr-3">Date</th>
              <th className="pb-2.5 pr-3 text-right">Score</th>
              <th className="pb-2.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td colSpan={4} className="py-3">
                    <div className="h-4 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-[13px] text-slate-500">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-[13px] text-slate-500">
                  No packs for this batch
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.packId} className="border-b border-slate-50 transition hover:bg-slate-50">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                        EP
                      </span>
                      <div>
                        <p className="text-[13px] font-medium text-slate-900">{row.paymentRef}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {row.packId.length > 18 ? `${row.packId.slice(0, 18)}…` : row.packId}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-[13px] text-slate-600">
                    {formatEvidenceDate(row.generatedAt)}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums text-[13px] font-semibold text-slate-900">
                    {row.proofScore != null ? `${row.proofScore}%` : '—'}
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(row.proofStatusKey)}`}
                    >
                      {row.proofStatus}
                    </span>
                    <Link
                      href={`/payout-command-view/evidence-pack/${encodeURIComponent(row.packId)}`}
                      className="ml-2 text-[11px] font-semibold text-[#00239C] hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}
