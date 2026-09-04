import { Suspense } from 'react'
import { EvidencePackDetailClient } from '@/features/payout-command/evidence-pack/_components/EvidencePackDetailClient'

export default function EvidencePackPage({ params }: { params: { packId: string } }) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[#6f716d]">Loading evidence pack…</div>}>
      <EvidencePackDetailClient packId={params.packId} />
    </Suspense>
  )
}
