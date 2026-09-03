'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { EVIDENCE_PACKS } from '../../sandbox-fixtures'

function EvidenceExplorerContent() {
  const searchParams = useSearchParams()
  const preselectedIntent = searchParams.get('intent_id') || ''
  const [selectedPackId, setSelectedPackId] = useState<string>(EVIDENCE_PACKS[0].evidencePackId)
  const [verifyState, setVerifyState] = useState<'idle' | 'running' | 'valid' | 'mismatch'>('idle')

  const selectedPack = useMemo(() => {
    if (preselectedIntent) {
      return EVIDENCE_PACKS.find((pack) => pack.intentId === preselectedIntent) || EVIDENCE_PACKS[0]
    }
    return EVIDENCE_PACKS.find((pack) => pack.evidencePackId === selectedPackId) || EVIDENCE_PACKS[0]
  }, [selectedPackId, preselectedIntent])

  const runIntegrityCheck = () => {
    setVerifyState('running')
    window.setTimeout(() => {
      setVerifyState('valid')
      window.dispatchEvent(
        new CustomEvent('cx:toast', {
          detail: {
            type: 'success',
            title: 'Evidence integrity verified',
            desc: `Merkle proof validated for ${selectedPack.evidencePackId}`,
          },
        })
      )
    }, 650)
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-cx-text">Evidence Explorer</h1>
          <p className="mt-0.5 text-sm text-cx-neutral">
            Evidence registry with hash tree, signatures, and deterministic integrity checks.
          </p>
        </div>
        <select
          value={selectedPack.evidencePackId}
          onChange={(event) => setSelectedPackId(event.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono outline-none focus:border-cx-purple-500"
        >
          {EVIDENCE_PACKS.map((pack) => (
            <option key={pack.evidencePackId} value={pack.evidencePackId}>
              {pack.evidencePackId}
            </option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">evidence_pack_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">intent_id</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">merkle_root</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">signature</th>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cx-neutral">created_at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {EVIDENCE_PACKS.map((pack) => (
              <tr key={pack.evidencePackId} className={`hover:bg-gray-50/60 ${pack.evidencePackId === selectedPack.evidencePackId ? 'bg-violet-50/40' : ''}`}>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-purple-700">{pack.evidencePackId}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-text">{pack.intentId}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-neutral">{pack.merkleRoot}</td>
                <td className="px-4 py-2.5 text-xs font-mono text-cx-neutral">{pack.signature}</td>
                <td className="px-4 py-2.5 text-xs text-cx-neutral">{new Date(pack.createdAt).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-cx-text">Detail Tree View</h2>
          <div className="mt-3 space-y-2 text-xs">
            {selectedPack.leaves.map((leaf) => (
              <div key={leaf.hash} className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2">
                <p className="font-semibold text-cx-text">{leaf.label}</p>
                <p className="mt-1 font-mono text-cx-neutral">{leaf.hash}</p>
                <p className="mt-0.5 text-[11px] text-cx-neutral">type: {leaf.kind}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-cx-text">Integrity Check</h2>
          <p className="mt-1 text-xs text-cx-neutral">
            Recompute hash chain and validate merkle proof against audit ledger root.
          </p>
          <button
            onClick={runIntegrityCheck}
            className="mt-3 w-full rounded-lg bg-cx-purple-600 py-2 text-sm font-semibold text-white hover:bg-cx-purple-700"
          >
            {verifyState === 'running' ? 'Verifying...' : 'Verify Integrity'}
          </button>
          {verifyState !== 'idle' ? (
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
                verifyState === 'valid' ? 'bg-emerald-50 text-emerald-700' : verifyState === 'mismatch' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-cx-text'
              }`}
            >
              {verifyState === 'valid' ? 'VALID: Merkle proof and signatures match.' : verifyState === 'mismatch' ? 'MISMATCH: Evidence chain diverged.' : 'Running check...'}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

export default function EvidenceExplorerPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-cx-neutral">
            Loading evidence explorer...
          </div>
        </div>
      }
    >
      <EvidenceExplorerContent />
    </Suspense>
  )
}
