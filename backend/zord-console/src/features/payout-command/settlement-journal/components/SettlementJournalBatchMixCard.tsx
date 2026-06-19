'use client'

import {
  JOURNAL_INSIGHT_DARK_CARD,
  JOURNAL_INSIGHT_DARK_LABEL,
  JOURNAL_INSIGHT_DARK_MUTED,
} from '../../command-center/homeCommandCenterTokens'
import { JournalBatchMixCardBody } from '../../journal/JournalBatchMixCardLayout'
import { useSettlementBatchSelection } from '../context/SettlementBatchSelectionContext'
import { useSettlementBatchSummary } from '../hooks/useSettlementBatchSummary'

const MIX_COLORS = ['#5eead4', '#f43f5e', '#52525b']

type SettlementJournalBatchMixCardProps = {
  showHeader?: boolean
  fillHeight?: boolean
}

export function SettlementJournalBatchMixCard({
  showHeader = true,
  fillHeight = false,
}: SettlementJournalBatchMixCardProps) {
  const { selectedClientBatchId } = useSettlementBatchSelection()
  const { rows, loading, outcome } = useSettlementBatchSummary()

  const other = Math.max(0, outcome.total - outcome.settled - outcome.failed)
  const slices = [
    { name: 'Settled', value: outcome.settled },
    { name: 'Failed', value: outcome.failed },
    { name: 'Other', value: other },
  ].filter((s) => s.value > 0)

  const legend = [
    { label: 'Settled', value: outcome.settled.toLocaleString('en-US'), color: MIX_COLORS[0] },
    { label: 'Failed', value: outcome.failed.toLocaleString('en-US'), color: MIX_COLORS[1] },
    { label: 'Other', value: other.toLocaleString('en-US'), color: MIX_COLORS[2] },
  ]

  const rootClass = fillHeight
    ? `relative h-full min-h-0 flex flex-col overflow-hidden ${JOURNAL_INSIGHT_DARK_CARD}`
    : `relative overflow-hidden ${JOURNAL_INSIGHT_DARK_CARD}`

  return (
    <article className={rootClass}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <p className={JOURNAL_INSIGHT_DARK_LABEL}>Outcome mix</p>
          <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/70">
            Batch
          </span>
        </div>
      ) : fillHeight ? null : (
        <div className="pt-3" />
      )}
      {!selectedClientBatchId ? (
        <p className={`px-4 pb-4 pt-2 ${JOURNAL_INSIGHT_DARK_MUTED}`}>Select a batch to see outcome mix.</p>
      ) : loading && rows.length === 0 ? (
        <p className={`px-4 pb-4 pt-2 ${JOURNAL_INSIGHT_DARK_MUTED}`}>Loading…</p>
      ) : (
        <JournalBatchMixCardBody
          slices={slices}
          legend={legend}
          colors={MIX_COLORS}
          fillHeight={fillHeight}
        />
      )}
    </article>
  )
}
