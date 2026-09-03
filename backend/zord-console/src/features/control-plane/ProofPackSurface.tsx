'use client'

import { useState } from 'react'
import { fetchProofPack, verifyPac, verifyProofPack } from '@/services/protocol/controlPlaneClient'
import { CROSS_BORDER_PAC_ID } from '@/services/payout-command/demo/scenarioMode'
import type { ProtocolVerifyResult } from '@/types/protocol'
import {
  ControlPlaneHeader,
  CopyChip,
  EvidenceChip,
  PageState,
  ProtocolJsonPanel,
} from './ProtocolChrome'
import { useProtocolQuery } from './useProtocolQuery'
import { UploadGate } from '@/features/payout-command/demo/UploadGate'
import { FlowCompletionPopup } from './FlowCompletionPopup'

export function ProofPackSurface({ traceId }: { traceId: string }) {
  return (
    <UploadGate require="both" title="No evidence packs yet">
      <ProofPackBody traceId={traceId} />
    </UploadGate>
  )
}

function ProofPackBody({ traceId }: { traceId: string }) {
  const { data, error, loading } = useProtocolQuery(`proof:${traceId}`, () => fetchProofPack(traceId))
  const [result, setResult] = useState<{ result: ProtocolVerifyResult; note?: string } | null>(null)
  const [proofPopupOpen, setProofPopupOpen] = useState(false)
  const [proofPopupShown, setProofPopupShown] = useState(false)

  return (
    <div className="bg-[#F7F8FB]">
      <ControlPlaneHeader
        title="Proof Pack"
        subtitle="Another system can verify authority and outcome without trusting this dashboard. Result comes from computation, not a green badge."
        chips={<EvidenceChip kind="verified">Tamper-evident</EvidenceChip>}
      />
      <PageState loading={loading} error={error}>
        {data ? (
          <div className="space-y-4 p-6">
            <p className="text-[16px] font-semibold text-[#0B1324]">
              {data.verification.result} · {data.pack.evidence_object_count as number} evidence objects
            </p>
            <div className="flex flex-wrap gap-2">
              <CopyChip label="Pack" value={String(data.pack.pack_id ?? '')} />
              <CopyChip label="PAC digest" value={String(data.pac.digest ?? '')} />
              <CopyChip label="Merkle" value={String(data.pack.merkle_root ?? '')} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-10 rounded-md bg-[#0B1324] px-4 text-[13px] font-semibold text-white"
                onClick={async () => {
                  const pack = await verifyProofPack()
                  const pac = await verifyPac(CROSS_BORDER_PAC_ID)
                  setResult({ result: pack.result, note: `PAC ${pac.result}` })
                }}
              >
                Verify pack
              </button>
              <button
                type="button"
                className="h-10 rounded-md border border-[#C2413B] px-4 text-[13px] font-semibold text-[#C2413B]"
                onClick={async () => {
                  const pack = await verifyProofPack({ tamper: true })
                  setResult({ result: pack.result, note: 'Evidence object mutated' })
                }}
              >
                Tamper simulation
              </button>
              <button
                type="button"
                className="h-10 rounded-md border border-[#D8DEE9] px-4 text-[13px] font-semibold text-[#0B1324]"
                onClick={async () => {
                  const pac = await verifyPac(CROSS_BORDER_PAC_ID, { tamper_amount_minor: 550_001 })
                  setResult({ result: pac.result, note: 'Amount changed by one cent' })
                }}
              >
                Tamper PAC amount
              </button>
            </div>
            {result ? (
              <p className={`text-[14px] font-semibold ${result.result === 'VALID' ? 'text-[#138A63]' : 'text-[#C2413B]'}`}>
                {result.result}
                {result.note ? ` · ${result.note}` : ''}
              </p>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              {['Authority', 'Action', 'Execution', 'Observation', 'Lifecycle', 'Finality', 'Integrity'].map((section) => (
                <article key={section} className="rounded-lg border border-[#D8DEE9] bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">{section}</p>
                  <p className="mt-1 text-[12px] text-[#0B1324]">Included in operator disclosure profile.</p>
                </article>
              ))}
            </div>
            <ProtocolJsonPanel object={data.pack} title="ProofPackManifest" />
          </div>
        ) : null}
      </PageState>

      <FlowCompletionPopup
        open={proofPopupOpen}
        onClose={() => setProofPopupOpen(false)}
        title="Proof pack verified"
        description="Authority, dispatch, evidence, lifecycle, and finality all verified. Another system can check this pack without trusting the dashboard."
        nextLabel={undefined}
        nextHref={undefined}
        traceId={traceId}
      />
    </div>
  )
}
