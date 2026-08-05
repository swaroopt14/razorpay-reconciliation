'use client'

import { JournalIntelligenceKpiHero } from '../../command-center/JournalIntelligenceKpiHero'
import { formatJournalMoney } from '../../intent-journal/formatJournalMoney'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementBatchSummary } from '../hooks/useSettlementBatchSummary'
import { useSettlementBatchIntelligence } from '../hooks/useSettlementBatchIntelligence'
import { settlementJournalCopy } from '../copy/settlementJournalCopy'
import { derivePaymentPartnerLabel } from '../selectors/derivePaymentPartnerLabel'
import { outcomeFromMatchConfidence } from '../settlementJournalSidebarUtils'

type SettlementJournalHeroBannerProps = {
  onExport: () => void
  exportDisabled?: boolean
  filteredCount: number
  filtersActive: boolean
}

function parseBatchContractAmount(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function SettlementJournalHeroBanner({
  onExport,
  exportDisabled,
  filteredCount,
  filtersActive,
}: SettlementJournalHeroBannerProps) {
  const { selectedClientBatchId, journalEnabled, tenantReady } = useSettlementBatchSelection()
  const { loading, rows, observationTotal } = useSettlementBatchSummary()
  const { batchContract, kpis, loading: intelligenceLoading } = useSettlementBatchIntelligence(
    selectedClientBatchId,
    journalEnabled && tenantReady,
  )

  const copy = settlementJournalCopy.kpi
  const totalSettlementValue = parseBatchContractAmount(
    (batchContract as { original_settled_amount?: unknown } | null)?.original_settled_amount,
  )
  const observedValue =
    intelligenceLoading && totalSettlementValue == null
      ? '—'
      : totalSettlementValue != null
        ? formatJournalMoney(totalSettlementValue)
        : '—'
  const recordsTotal = observationTotal ?? null
  const countLine =
    recordsTotal != null ? recordsTotal.toLocaleString('en-IN') : loading ? '…' : '—'
  const paymentPartner = derivePaymentPartnerLabel(rows)
  const recordsReceivedDisplay =
    loading && recordsTotal == null ? '—' : recordsTotal != null ? recordsTotal.toLocaleString('en-IN') : '—'
  const settlementMatchedDisplay =
    intelligenceLoading && kpis.settlementValueMatched == null
      ? '—'
      : kpis.settlementValueMatched != null
        ? formatJournalMoney(kpis.settlementValueMatched)
        : '—'
  const varianceAmount = parseBatchContractAmount(batchContract?.variance_amount)
  const varianceDisplay =
    intelligenceLoading && varianceAmount == null
      ? '—'
      : varianceAmount != null
        ? formatJournalMoney(varianceAmount)
        : '—'
  const varianceSub = varianceAmount != null ? copy.amountVariance : '—'

  const matchOutcome = outcomeFromMatchConfidence(kpis.matchConfidence)
  const deltaPill =
    kpis.matchConfidence != null
      ? `${matchOutcome.label} · ${matchOutcome.progressPct}% match`
      : intelligenceLoading
        ? '…'
        : '—'

  const obsSub =
    filtersActive && recordsTotal != null
      ? `${filteredCount.toLocaleString('en-IN')} filtered · ${recordsTotal.toLocaleString('en-IN')} total`
      : recordsTotal != null
        ? copy.recordsReceivedSub(recordsTotal.toLocaleString('en-IN'))
        : loading
          ? 'Loading observation count…'
          : '—'

  const buckets = [
    { label: copy.paymentPartner, value: paymentPartner, sub: copy.paymentPartnerSub },
    { label: copy.recordsReceived, value: recordsReceivedDisplay, sub: obsSub },
    {
      label: copy.settlementValueMatched,
      value: settlementMatchedDisplay,
      sub: copy.settlementValueMatchedSub,
    },
    { label: copy.amountVariance, value: varianceDisplay, sub: varianceSub },
  ] as const

  return (
    <JournalIntelligenceKpiHero
      className="mb-4"
      eyebrow={settlementJournalCopy.hero.label}
      value={observedValue}
      deltaPill={deltaPill}
      subcopy={`${selectedClientBatchId || settlementJournalCopy.sidebar.selectBatch} · ${countLine} ${settlementJournalCopy.sidebar.records}`}
      buckets={buckets}
      testId="settlement-kpi-hero"
      footer={
        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled || !selectedClientBatchId}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          {settlementJournalCopy.export.menuLabel}
        </button>
      }
    />
  )
}
