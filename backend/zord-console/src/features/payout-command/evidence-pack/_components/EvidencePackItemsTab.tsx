'use client'

import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { JOURNAL_DM_SANS } from '../../journal/journalFonts'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { resolveExplicitSignal } from '../../evidence/utils/proofSignals'

type BusinessItemRow = {
  label: string
  reason: string
  tooltip: string
  status: string
  ok: boolean
}

type EvidencePackItemsTabProps = {
  pack: EvidencePackFull | null
  loading: boolean
}

const ITEM_LABEL_BY_TYPE: Record<string, string> = {
  RAW_SETTLEMENT_LINE: 'Bank Record',
  RAW_SETTLEMENT_FILE: 'Source File',
  RAW_SETTLEMENT_ENVELOPE: 'Source File',
  CANONICAL_SETTLEMENT: 'Processed Payment',
  CANONICAL_SETTLEMENT_OBSERVATION: 'Processed Payment',
  ATTACHMENT_DECISION: 'Payment Match',
  ATTACHMENT_ENGINE: 'Payment Match',
  VARIANCE_DECISION: 'Difference Check',
  ENVELOPE_HASH: 'Data Security',
  CANONICAL_INTENT: 'Payment Record',
  CANONICAL_INTENT_HASH: 'Payment Record',
  RAW_INGRESS_ENVELOPE: 'Payment Record',
  GOVERNANCE_DECISION: 'Compliance Check',
  GOVERNANCE_DECISION_AT_CANONICAL: 'Compliance Check',
}

function displayItemLabel(type: string | undefined): string {
  const key = (type || '').toUpperCase()
  return ITEM_LABEL_BY_TYPE[key] || 'Evidence Item'
}

export function EvidencePackItemsTab({ pack, loading }: EvidencePackItemsTabProps) {
  if (loading) return <p className="text-[15px] text-[#6f716d]">Loading evidence items…</p>
  if (!pack?.items?.length) {
    return <p className="text-[15px] text-[#6f716d]">{evidenceCopy.empty.noPackHint}</p>
  }

  const typeSet = new Set((pack.items ?? []).map((it) => (it.type || '').toUpperCase()))
  const hashCoverageOk = (pack.items ?? []).every((it) => Boolean(it.hash || it.leaf_hash))
  const settlementAvailable =
    resolveExplicitSignal(pack, {
      component: 'settlement_record_available',
      flag: 'settlement_leaf_present_flag',
    }) ??
    (typeSet.has('RAW_SETTLEMENT_ENVELOPE') ||
      typeSet.has('RAW_SETTLEMENT_FILE') ||
      typeSet.has('CANONICAL_SETTLEMENT_OBSERVATION'))
  const matchAvailable =
    resolveExplicitSignal(pack, {
      component: 'match_decision_available',
      flag: 'attachment_decision_leaf_present_flag',
    }) ?? typeSet.has('ATTACHMENT_DECISION')
  const governanceAvailable =
    resolveExplicitSignal(pack, {
      component: 'governance_decision_available',
    }) ?? (typeSet.has('GOVERNANCE_DECISION_AT_CANONICAL') || typeSet.has('GOVERNANCE_DECISION'))
  const instructionAvailable =
    resolveExplicitSignal(pack, {
      component: 'payment_instruction_available',
    }) ?? (typeSet.has('RAW_INGRESS_ENVELOPE') || typeSet.has('CANONICAL_INTENT'))

  const rows: BusinessItemRow[] = [
    {
      label: 'Bank Record',
      reason: 'Original entry from bank',
      tooltip: 'Original line from bank settlement file',
      status: settlementAvailable ? 'Verified' : 'Missing',
      ok: settlementAvailable,
    },
    {
      label: 'Processed Payment',
      reason: 'Cleaned and structured record',
      tooltip: 'Validated record after standardization',
      status: settlementAvailable ? 'Verified' : 'Pending',
      ok: settlementAvailable,
    },
    {
      label: 'Payment Match',
      reason: 'Linked to your payment',
      tooltip: 'Match decision linked this record to the payment',
      status: matchAvailable ? 'Verified' : 'Pending',
      ok: matchAvailable,
    },
    {
      label: 'Difference Check',
      reason: 'Checked for mismatches',
      tooltip: 'Variance checks passed for this payment',
      status: typeSet.has('VARIANCE_DECISION') || matchAvailable ? 'No issues' : 'Pending',
      ok: typeSet.has('VARIANCE_DECISION') || matchAvailable,
    },
    {
      label: 'Data Security',
      reason: 'Record has not been changed',
      tooltip: 'Hash coverage confirms record integrity',
      status: hashCoverageOk ? 'Verified' : 'Review',
      ok: hashCoverageOk,
    },
    {
      label: 'Payment Record',
      reason: 'Your original payment request',
      tooltip: 'Original payment instruction from your system',
      status: instructionAvailable ? 'Verified' : 'Missing',
      ok: instructionAvailable,
    },
    {
      label: 'Compliance Check',
      reason: 'Passed all required checks',
      tooltip: 'Policy and compliance validations completed',
      status: governanceAvailable ? 'Approved' : 'Pending',
      ok: governanceAvailable,
    },
    {
      label: 'Source File',
      reason: 'Bank file used for settlement',
      tooltip: 'Source settlement file used for this Evidence Pack',
      status: settlementAvailable ? 'Verified' : 'Missing',
      ok: settlementAvailable,
    },
  ]
  const fullyVerified = rows.every((row) => row.ok)
  const missingRows = rows.filter((row) => !row.ok).map((row) => row.label)

  return (
    <div className={`rounded-[12px] border border-[#E5E5E5] ${JOURNAL_DM_SANS}`}>
      <div className="border-b border-[#E5E5E5] bg-[#fcfcfa] px-4 py-4">
        <p className="text-[17px] font-semibold text-[#111111]">Proof Details for This Payment</p>
        <p className="mt-1 text-[14px] leading-relaxed text-[#475569]">
          This section shows all records used to verify your payment. Each item helps confirm that the transaction is accurate and complete.
        </p>
      </div>
      <div
        className={`m-4 rounded-[10px] border px-4 py-3 ${
          fullyVerified
            ? 'border-slate-200 bg-slate-50'
            : 'border-amber-200 bg-amber-50/60'
        }`}
      >
        <p className={`text-[14px] font-semibold ${fullyVerified ? 'text-slate-900' : 'text-amber-900'}`}>
          {fullyVerified ? 'This payment is fully verified.' : 'This payment needs attention before final proof export.'}
        </p>
        {fullyVerified ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-slate-700">
            <li>The payment was recorded correctly.</li>
            <li>It matches bank data.</li>
            <li>No differences were found.</li>
            <li>It passed all compliance checks.</li>
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-amber-900">
            Missing or pending: {missingRows.join(', ')}.
          </p>
        )}
        <p className={`mt-2 text-[13px] ${fullyVerified ? 'text-slate-700' : 'text-amber-900'}`}>
          {fullyVerified
            ? 'You can safely use this for audits or disputes.'
            : 'Complete pending checks to make this payment fully dispute-ready.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[640px] w-full text-left text-[14px]">
        <thead className="bg-[#fcfcfa] text-[11px] font-semibold uppercase tracking-wide text-[#8a8a86]">
          <tr>
            <th className="px-4 py-3">What this shows</th>
            <th className="px-4 py-3">Why it matters</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]">
          {rows.map((row) => {
            return (
              <tr key={row.label}>
                <td className="px-4 py-3 text-[14px] font-semibold text-[#111111]">
                  <span className="inline-flex items-center gap-2">
                    {row.label}
                    <span
                      title={row.tooltip}
                      aria-label={row.tooltip}
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500"
                    >
                      i
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-[14px] text-[#475569]">{row.reason}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[12px] font-semibold ${row.ok ? 'bg-slate-100 text-slate-900' : 'bg-amber-50 text-amber-900'}`}>
                    {row.ok ? 'Verified' : row.status}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
        </table>
      </div>
      <details className="border-t border-[#E5E5E5] px-4 py-3">
        <summary className="cursor-pointer text-[12px] font-semibold uppercase tracking-wide text-slate-600">
          View technical details
        </summary>
        <div className="mt-2 space-y-1">
          {(pack.items ?? []).map((it, idx) => {
            const typeLabel = displayItemLabel(it.type)
            const hash = apiTrimmedString(it.hash) || apiTrimmedString(it.leaf_hash) || '—'
            return (
              <p key={`${typeLabel}-${idx}`} className="font-mono text-[11px] text-slate-600">
                {typeLabel}: {hash}
              </p>
            )
          })}
        </div>
      </details>
    </div>
  )
}
