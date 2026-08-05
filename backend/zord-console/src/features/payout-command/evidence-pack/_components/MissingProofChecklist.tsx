'use client'

import { checklistSectionTitle, deriveMissingProofChecklist } from '../../evidence/selectors/deriveMissingProofChecklist'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'

type MissingProofChecklistProps = {
  pack: EvidencePackFull | null
}

export function MissingProofChecklist({ pack }: MissingProofChecklistProps) {
  const items = deriveMissingProofChecklist(pack)
  if (items.length === 0) return null

  return (
    <div className="rounded-[12px] border border-amber-200/80 bg-amber-50/70 p-4">
      <p className="text-[15px] font-semibold text-amber-950">{evidenceCopy.empty.incomplete}</p>
      <p className="mt-1 text-[13px] text-amber-900">{evidenceCopy.empty.incompleteHint}</p>
      <p className="mt-3 text-[13px] font-semibold text-amber-950">{checklistSectionTitle()}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-[14px] text-amber-900">
            <span className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded border border-amber-400 bg-white" aria-hidden />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
