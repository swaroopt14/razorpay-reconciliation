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
    <div className="rounded-[12px] border border-[#0B1324]/20 bg-[#F1F5F9] p-4">
      <p className="text-[15px] font-semibold text-[#0B1324]">{evidenceCopy.empty.incomplete}</p>
      <p className="mt-1 text-[13px] text-[#0B1324]">{evidenceCopy.empty.incompleteHint}</p>
      <p className="mt-3 text-[13px] font-semibold text-[#0B1324]">{checklistSectionTitle()}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-[14px] text-[#0B1324]">
            <span className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded border border-[#0B1324]/40 bg-white" aria-hidden />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
