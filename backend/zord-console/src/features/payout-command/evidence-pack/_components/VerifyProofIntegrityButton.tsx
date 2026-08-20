'use client'

import { useState } from 'react'
import { evidenceCopy } from '../../evidence/copy/evidenceCopy'
import { postEvidencePackVerify } from '@/services/payout-command/prod-api/postEvidencePackVerify'
import { parseLayeredVerification } from '@/services/payout-command/prod-api/layeredVerification'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'

type VerifyProofIntegrityButtonProps = {
  pack: EvidencePackFull | null
}

export function VerifyProofIntegrityButton({ pack }: VerifyProofIntegrityButtonProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [overallLabel, setOverallLabel] = useState<string | null>(null)
  const [verifiedClaim, setVerifiedClaim] = useState(false)
  const [layers, setLayers] = useState<Array<{ label: string; status: string; explanation: string }>>([])
  const [proofRoot, setProofRoot] = useState<string | undefined>()
  const [verifiedAt, setVerifiedAt] = useState<string | undefined>()
  const [runId, setRunId] = useState<string | undefined>()

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
              const layered = parseLayeredVerification(data)
              setVerifiedClaim(layered.allowsVerifiedClaim)
              setOverallLabel(layered.overallLabel)
              setMessage(layered.explanation)
              setLayers(layered.layers.map((row) => ({
                label: row.label,
                status: row.status,
                explanation: row.explanation,
              })))
              setProofRoot(layered.storedRoot || layered.computedRoot)
              setVerifiedAt(layered.checkedAt ?? undefined)
              setRunId(layered.verificationRunId ?? undefined)
            } else {
              setVerifiedClaim(false)
              setOverallLabel(evidenceCopy.graph.verificationNotRun)
              setMessage(res.error ?? evidenceCopy.verify.failed)
              setLayers([])
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
            verifiedClaim ? 'border-black/40 bg-black text-white' : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <p className="font-semibold uppercase tracking-wide">{overallLabel}</p>
          <p className="mt-1 font-medium">{message}</p>
          {layers.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[12px]">
              {layers.map((layer) => (
                <li key={layer.label}>
                  {layer.label}: {layer.status}
                </li>
              ))}
            </ul>
          ) : null}
          {runId ? <p className="mt-1 font-mono text-[11px]">Run {runId}</p> : null}
          {proofRoot ? (
            <p className="mt-1 font-mono text-[11px] break-all">Proof root: {proofRoot}</p>
          ) : null}
          {verifiedAt ? (
            <p className="mt-1 text-[12px]">Checked at: {new Date(verifiedAt).toLocaleString()}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
