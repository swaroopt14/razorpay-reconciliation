'use client'

import { useMemo } from 'react'
import type { ProofPack } from '@/services/payout-command/demo/proofCenterDemo'
import { PROOF_LINEAGE_HEADER } from '@/services/payout-command/demo/proofGraphDemo'
import { MerkleGraphSurface } from '../surfaces/MerkleGraphSurface'
import { buildMerkleGraphFromProofPack } from './buildMerkleGraphFromProofPack'

/**
  * Spec 7.15 - Proof Graph.
  * Restores the interactive Merkle canvas; Spec header copy above it.
  */
export function ProofGraphPanel({ pack }: { pack: ProofPack; onToast?: (msg: string) => void }) {
  const graph = useMemo(() => buildMerkleGraphFromProofPack(pack), [pack])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#0B1324]">
          {PROOF_LINEAGE_HEADER.title}
        </h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#64748B]">
          {PROOF_LINEAGE_HEADER.subtitle}
        </p>
      </div>

      <MerkleGraphSurface
        key={pack.id}
        pack={graph}
        initialPackId={pack.id}
        embedMode
        hideScopePickers
        preferProvidedPack
        intentOptionsSource="table"
      />
    </div>
  )
}
