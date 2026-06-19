'use client'

import { useState } from 'react'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import { postEvidencePackVerify } from '@/services/payout-command/prod-api/postEvidencePackVerify'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'

type VerifyProofIntegrityButtonProps = {
  pack: EvidencePackFull | null
}

export function VerifyProofIntegrityButton({ pack }: VerifyProofIntegrityButtonProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)
  const [proofRoot, setProofRoot] = useState<string | undefined>()
  const [verifiedAt, setVerifiedAt] = useState<string | undefined>()

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={!pack || busy}
        onClick={() => {
          if (!pack) return
          setBusy(true)
          void postEvidencePackVerify(pack.evidence_pack_id).then((res) => {
            const data = res.data
            if (data) {
              const verified = data.status?.toUpperCase() === 'VERIFIED'
              setOk(verified)
              setMessage(data.explanation)
              setProofRoot(data.stored_root || data.computed_root)
              setVerifiedAt(data.checked_at)
            } else {
              setOk(false)
              setMessage(res.error ?? evidenceCopy.verify.failed)
            }
            setBusy(false)
          })
        }}
        className="rounded-[0.85rem] border border-[#E5E5E5] bg-white px-4 py-2 text-[14px] font-semibold text-[#111111] transition hover:border-[#000000]/30 disabled:opacity-50"
      >
        {busy ? evidenceCopy.graph.verifyBusy : evidenceCopy.verify.button}
      </button>
      {message ? (
        <div
          className={`rounded-lg border px-3 py-2 text-[13px] ${
            ok ? 'border-black/40 bg-black text-white' : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <p className="font-medium">{message}</p>
          {proofRoot ? (
            <p className="mt-1 font-mono text-[11px] break-all">Proof root: {proofRoot}</p>
          ) : null}
          {verifiedAt ? (
            <p className="mt-1 text-[12px]">Verified at: {new Date(verifiedAt).toLocaleString()}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
