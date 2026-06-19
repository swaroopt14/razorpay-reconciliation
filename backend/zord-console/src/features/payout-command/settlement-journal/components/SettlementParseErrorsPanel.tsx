'use client'

import {
  COMMAND_CENTER_KPI_CARD,
  COMMAND_CENTER_LABEL_GREEN,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import type { SettlementParseErrorRow } from '@/services/payout-command/prod-api/settlementObservations'
import { SettlementParseErrorsTable } from './SettlementParseErrorsTable'

type SettlementParseErrorsPanelProps = {
  rows: SettlementParseErrorRow[]
  loading: boolean
  selectedClientBatchId: string
}

export function SettlementParseErrorsPanel({
  rows,
  loading,
  selectedClientBatchId,
}: SettlementParseErrorsPanelProps) {
  if (!selectedClientBatchId) return null

  return (
    <section className={`relative mb-4 overflow-hidden ${COMMAND_CENTER_KPI_CARD} !p-0`}>
      <CommandCenterCardGlow />
      <div className="relative border-b border-slate-100 bg-slate-50 px-4 py-3">
        <p className={COMMAND_CENTER_LABEL_GREEN}>Review Items</p>
        <p className={`mt-1 text-[15px] font-semibold ${HOME_TITLE_BLACK}`}>
          Review Items
        </p>
        <p className={HOME_BODY_IMPERIAL_SM}>
          {loading ? 'Loading settlement parse errors…' : `${rows.length.toLocaleString('en-US')} failure row(s)`}
        </p>
      </div>

      <div className="overflow-x-auto px-2 py-2">
        <SettlementParseErrorsTable rows={rows} loading={loading} />
      </div>
    </section>
  )
}
