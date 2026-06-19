'use client'

import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import { formatJournalMoney } from '../../intent-journal/formatJournalMoney'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementBatchSummary } from '../hooks/useSettlementBatchSummary'
import { useSettlementBatchIntelligence } from '../hooks/useSettlementBatchIntelligence'
import { settlementJournalCopy } from '../copy/settlementJournalCopy'
import { derivePaymentPartnerLabel } from '../selectors/derivePaymentPartnerLabel'

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <article className={`relative ${COMMAND_CENTER_KPI_CARD} !p-4`}>
      <CommandCenterCardGlow />
      <p className={`relative ${COMMAND_CENTER_LABEL_GREEN}`}>{label}</p>
      <p className={`relative mt-2 text-[22px] font-extrabold tabular-nums leading-none tracking-[-0.02em] ${HOME_TITLE_BLACK}`}>
        {value}
      </p>
      <p className={`relative mt-1 ${HOME_BODY_IMPERIAL_SM}`}>{sub}</p>
    </article>
  )
}

function formatVarianceAmount(value: number | null): string {
  if (value == null) return '—'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatJournalMoney(value)}`
}

type SettlementJournalKpiStripProps = {
  filteredCount: number
  filtersActive: boolean
}

export function SettlementJournalKpiStrip({ filteredCount, filtersActive }: SettlementJournalKpiStripProps) {
  const { selectedClientBatchId, journalEnabled, tenantReady } = useSettlementBatchSelection()
  const { rows, loading, observationTotal } = useSettlementBatchSummary()
  const { kpis, loading: intelligenceLoading } = useSettlementBatchIntelligence(
    selectedClientBatchId,
    journalEnabled && tenantReady,
  )

  const copy = settlementJournalCopy.kpi

  if (!selectedClientBatchId) {
    return (
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[copy.paymentPartner, copy.recordsReceived, copy.settlementValueMatched, copy.amountVariance].map(
          (label) => (
            <KpiCard key={label} label={label} value="—" sub={settlementJournalCopy.sidebar.selectBatch} />
          ),
        )}
      </div>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <p className={`mb-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3 ${HOME_BODY_IMPERIAL_SM}`}>
        Loading batch KPIs…
      </p>
    )
  }

  const recordsTotal = observationTotal ?? rows.length
  const paymentPartner = derivePaymentPartnerLabel(rows)
  const obsSub = filtersActive
    ? `${filteredCount.toLocaleString('en-IN')} filtered · ${recordsTotal.toLocaleString('en-IN')} total`
    : copy.recordsReceivedSub(recordsTotal.toLocaleString('en-IN'))

  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label={copy.paymentPartner} value={paymentPartner} sub={copy.paymentPartnerSub} />
      <KpiCard
        label={copy.recordsReceived}
        value={recordsTotal.toLocaleString('en-IN')}
        sub={obsSub}
      />
      <KpiCard
        label={copy.settlementValueMatched}
        value={
          intelligenceLoading && kpis.settlementValueMatched == null
            ? '—'
            : kpis.settlementValueMatched != null
              ? formatJournalMoney(kpis.settlementValueMatched)
              : '—'
        }
        sub={copy.settlementValueMatchedSub}
      />
      <KpiCard
        label={copy.amountVariance}
        value={
          intelligenceLoading && kpis.varianceAmount == null
            ? '—'
            : formatVarianceAmount(kpis.varianceAmount)
        }
        sub={kpis.varianceAmount != null ? copy.amountVarianceSub : copy.amountVarianceAwaiting}
      />
    </div>
  )
}
