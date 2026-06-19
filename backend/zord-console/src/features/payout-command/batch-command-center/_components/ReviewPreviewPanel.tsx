'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { BatchRow } from '@/services/payout-command/batch-model'
import { formatInrPrecise } from '@/services/payout-command/batch-model'
import type { JournalFailureRow, JournalIntentRow } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'
import { PORTAL_CARD } from './portal/batchPortalTokens'
export type ReviewItemRow = {
  id: string
  paymentRef: string
  invoiceNo: string
  beneficiary: string
  amount: number
  issue: string
  confidence: string
  isDlq: boolean
}

type PreviewMode = 'intent' | 'settlement'

function formatConfidenceDisplay(score: number | null | undefined, label?: string): string {
  if (label?.trim()) return label
  if (score == null || !Number.isFinite(score)) return '—'
  const pct = score <= 1 ? score * 100 : score
  return `${Math.round(pct)}%`
}

export function mapIntentReviewRows(failures: JournalFailureRow[], intents: JournalIntentRow[]): ReviewItemRow[] {
  const failureItems: ReviewItemRow[] = failures.map((r) => ({
    id: r.requestId,
    paymentRef: r.reference || r.requestId,
    invoiceNo: '—',
    beneficiary: r.reference || r.requestId,
    amount: r.amount,
    issue: r.failureReason || r.failureStage,
    confidence: '—',
    isDlq: true,
  }))
  const intentItems: ReviewItemRow[] = intents
    .filter((r) => r.status === 'Needs Review' || r.status === 'Pending' || r.status === 'In Progress')
    .map((r) => ({
      id: r.requestId,
      paymentRef: r.reference || r.requestId,
      invoiceNo: '—',
      beneficiary: r.paymentPartner || r.bank || r.reference,
      amount: r.amount,
      issue: r.match || r.status,
      confidence: formatConfidenceDisplay(r.confidenceScore, r.confidenceLabel),
      isDlq: false,
    }))
  return [...failureItems, ...intentItems].slice(0, 25)
}

function mapSettlementReviewRows(rows: SettlementObservationTableRow[]): ReviewItemRow[] {
  return rows
    .filter((r) => {
      const st = (r.statusRaw ?? r.status ?? '').toUpperCase()
      const failed = st.includes('FAIL') || st.includes('REJECT')
      const unmatched = !r.matchedIntentId || r.matchedIntentId === '—'
      const lowMap = r.mappingConfidence != null && r.mappingConfidence < 0.5
      return failed || unmatched || lowMap
    })
    .slice(0, 25)
    .map((r) => ({
      id: r.observationId,
      paymentRef: r.clientRef !== '—' ? r.clientRef : r.providerRef,
      invoiceNo: '—',
      beneficiary: r.bankRef !== '—' ? r.bankRef : r.sourceSystem,
      amount: r.amount,
      issue: r.failureReasonCode !== '—' ? r.failureReasonCode : r.status,
      confidence:
        r.mappingConfidence != null && Number.isFinite(r.mappingConfidence)
          ? formatConfidenceDisplay(r.mappingConfidence)
          : '—',
      isDlq: false,
    }))
}

function mapFilePreviewRows(rows: BatchRow[]): ReviewItemRow[] {
  return rows.slice(0, 25).map((r, idx) => ({
    id: `file-${idx}-${r.refId}`,
    paymentRef: r.refId,
    invoiceNo: r.invoiceNo?.trim() || '—',
    beneficiary: r.beneficiary,
    amount: r.amount,
    issue: r.status,
    confidence: '—',
    isDlq: false,
  }))
}

function ModeToggle({ mode, onChange }: { mode: PreviewMode; onChange: (m: PreviewMode) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-0.5">
      {(['intent', 'settlement'] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-md px-3 py-1.5 text-[12px] font-semibold capitalize transition ${
            mode === key ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'
          }`}
        >
          {key}
        </button>
      ))}
    </div>
  )
}

function ReviewTableBody({
  rows,
  failuresTabHref,
  emptyMessage,
}: {
  rows: ReviewItemRow[]
  failuresTabHref: string
  emptyMessage: string
}) {
  const c = BATCH_REVIEW_COPY.reviewTable
  if (rows.length === 0) {
    return <p className="mt-6 text-[13px] text-[#64748b]">{emptyMessage}</p>
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-[#e2e8f0]">
      <table className="min-w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
            {Object.values(c.columns).map((h) => (
              <th key={h} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#64748b]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
              <td className="px-3 py-2.5 font-mono text-[12px]">{row.paymentRef}</td>
              <td className="px-3 py-2.5">{row.invoiceNo}</td>
              <td className="px-3 py-2.5">{row.beneficiary}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{formatInrPrecise(row.amount)}</td>
              <td className="px-3 py-2.5 max-w-[200px] truncate" title={row.issue}>
                {row.issue}
              </td>
              <td className="px-3 py-2.5">{row.confidence}</td>
              <td className="px-3 py-2.5">
                <Link href={failuresTabHref} className="font-semibold text-[#2563eb] underline">
                  {c.actions.review}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReviewPreviewPanel({
  failures,
  intents,
  settlementRows,
  intentFileRows,
  settlementFileRows,
  failuresTabHref,
  loading,
}: {
  failures: JournalFailureRow[]
  intents: JournalIntentRow[]
  settlementRows: SettlementObservationTableRow[]
  intentFileRows: BatchRow[]
  settlementFileRows: BatchRow[]
  failuresTabHref: string
  loading?: boolean
}) {
  const [queueMode, setQueueMode] = useState<PreviewMode>('intent')
  const [fileMode, setFileMode] = useState<PreviewMode>('intent')
  const c = BATCH_REVIEW_COPY.reviewTable

  const intentQueueRows = mapIntentReviewRows(failures, intents)
  const settlementQueueRows = mapSettlementReviewRows(settlementRows)
  const queueRows = queueMode === 'intent' ? intentQueueRows : settlementQueueRows
  const fileRows = fileMode === 'intent' ? intentFileRows : settlementFileRows
  const filePreviewRows = mapFilePreviewRows(fileRows)

  return (
    <section id="batch-review-items" className={`${PORTAL_CARD} scroll-mt-24 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-[#0f172a]">{c.title}</h2>
          <p className="mt-1 text-[13px] text-[#64748b]">{c.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeToggle mode={queueMode} onChange={setQueueMode} />
          <Link
            href={failuresTabHref}
            className="inline-flex h-9 items-center rounded-lg bg-[#2563eb] px-3.5 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
          >
            {c.reviewInEngine}
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-[13px] text-[#64748b]">Loading review items…</p>
      ) : (
        <ReviewTableBody
          rows={queueRows}
          failuresTabHref={failuresTabHref}
          emptyMessage={queueMode === 'intent' ? c.emptySelect : 'No settlement observations need review for this batch.'}
        />
      )}

      <div className="mt-8 border-t border-[#e2e8f0] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-bold text-[#0f172a]">{BATCH_REVIEW_COPY.filePreview.title}</h3>
            <p className="mt-1 text-[13px] text-[#64748b]">{BATCH_REVIEW_COPY.filePreview.subtitle}</p>
          </div>
          <ModeToggle mode={fileMode} onChange={setFileMode} />
        </div>
        <ReviewTableBody
          rows={filePreviewRows}
          failuresTabHref={failuresTabHref}
          emptyMessage={BATCH_REVIEW_COPY.filePreview.empty}
        />
      </div>
    </section>
  )
}
