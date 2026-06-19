'use client'

import { evidenceCopy } from '../copy/evidenceCopy'
import { EVIDENCE_ASK } from '../utils/evidenceFormat'

export function EvidenceTrustNote() {
  return (
    <p className={`rounded-[12px] border ${EVIDENCE_ASK.border} ${EVIDENCE_ASK.inset} px-4 py-3 text-[13px] leading-relaxed text-[#6f716d]`}>
      {evidenceCopy.trustNote}
    </p>
  )
}
