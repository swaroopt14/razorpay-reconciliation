'use client'

import type { SettlementParseErrorRow } from '@/services/payout-command/prod-api/settlementObservations'

function parseRowNumber(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function sortSettlementParseErrors(rows: SettlementParseErrorRow[]) {
  return [...rows].sort((a, b) => {
    const an = parseRowNumber(a.source_row_ref)
    const bn = parseRowNumber(b.source_row_ref)
    if (an != null && bn != null) return an - bn
    if (an != null) return -1
    if (bn != null) return 1
    return 0
  })
}

type SettlementParseErrorsTableProps = {
  rows: SettlementParseErrorRow[]
  loading: boolean
  emptyMessage?: string
}

export function SettlementParseErrorsTable({
  rows,
  loading,
  emptyMessage = 'No settlement parse failures for this batch.',
}: SettlementParseErrorsTableProps) {
  const sortedRows = sortSettlementParseErrors(rows)

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left text-[14px]">
        <thead className="bg-[#f8fafc]">
          <tr>
            {['Source Row', 'Error Stage', 'Reason Code', 'Severity'].map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#888888] whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-14 text-center text-[15px] text-[#64748b]">
                {loading ? 'Fetching failure rows…' : emptyMessage}
              </td>
            </tr>
          ) : (
            sortedRows.map((row, index) => (
              <tr
                key={`${row.source_row_ref ?? 'row'}-${row.reason_code ?? 'code'}-${index}`}
                className="border-t border-slate-100"
              >
                <td className="px-3 py-2.5 font-mono text-[12px] text-[#334155]">
                  {row.source_row_ref || '—'}
                </td>
                <td className="px-3 py-2.5 text-[#334155]">{row.error_stage || '—'}</td>
                <td className="px-3 py-2.5 text-rose-700">{row.reason_code || '—'}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      (row.severity || '').toUpperCase() === 'ERROR'
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {row.severity || '—'}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
