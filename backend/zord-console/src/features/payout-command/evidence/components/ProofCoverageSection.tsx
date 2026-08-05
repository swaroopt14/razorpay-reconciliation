'use client'

import { CommandCenterCardGlow } from '../../command-center/CommandCenterCardGlow'
import {
  COMMAND_CENTER_KPI_CARD,
  HOME_BODY_IMPERIAL_SM,
  HOME_TITLE_BLACK,
} from '../../command-center/homeCommandCenterTokens'
import { evidenceCopy } from '../copy/evidenceCopy'
import type { ProofCoverageTile } from '../types/evidenceViewModels'
import { EVIDENCE_ASK } from '../utils/evidenceFormat'

function statusLabel(status: ProofCoverageTile['status']): string {
  if (status === 'available') return evidenceCopy.coverage.available
  if (status === 'generated') return evidenceCopy.coverage.generated
  if (status === 'not_generated') return evidenceCopy.coverage.notGenerated
  if (status === 'missing') return evidenceCopy.coverage.missing
  return '—'
}

function statusTone(status: ProofCoverageTile['status']): string {
  if (status === 'available' || status === 'generated')
    return 'border-[#000000]/40 bg-[#f4f4f5] text-[#000000]'
  if (status === 'missing' || status === 'not_generated') return 'border-amber-200/80 bg-amber-50/70 text-amber-900'
  return `border ${EVIDENCE_ASK.border} bg-white text-[#475569]`
}

type ProofCoverageSectionProps = {
  tiles: ProofCoverageTile[]
}

export function ProofCoverageSection({ tiles }: ProofCoverageSectionProps) {
  return (
    <section className={COMMAND_CENTER_KPI_CARD}>
      <CommandCenterCardGlow />
      <div className="relative border-b border-slate-100 px-5 py-4">
        <p className={`text-[17px] font-semibold ${HOME_TITLE_BLACK}`}>{evidenceCopy.coverage.title}</p>
        <p className={`mt-0.5 max-w-xl ${HOME_BODY_IMPERIAL_SM}`}>
          What proof exists for the current batch view.
        </p>
      </div>
      <div className="relative grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div
            key={tile.id}
            className={`rounded-[12px] border p-4 ${statusTone(tile.status)}`}
          >
            <p className="text-[12px] font-semibold uppercase tracking-wide opacity-80">{tile.label}</p>
            <p className="mt-2 text-[18px] font-bold">{statusLabel(tile.status)}</p>
            {tile.isBatchEstimate ? (
              <p className="mt-1 text-[11px] font-medium opacity-70">{evidenceCopy.coverage.batchEstimate}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
