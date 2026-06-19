'use client'

import { useState } from 'react'
import { evidenceCopy, type DisputeReason } from '../copy/evidenceCopy'
import type { PackTableRowVm } from '../types/evidenceViewModels'
import { downloadDisputeBundle } from '../utils/verifyProofIntegrity'
import { getEvidencePackFull } from '@/services/payout-command/prod-api/getEvidencePacks'
import { mapProofTimeline } from '../mappers/mapProofTimeline'
import { deriveMissingProofChecklist } from '../selectors/deriveMissingProofChecklist'
import { EVIDENCE_CARD } from '../evidencePageTokens'
import { EvidenceSectionHeader } from './EvidenceSectionHeader'

type DisputeResolverPanelProps = {
  packRows: PackTableRowVm[]
}

const inputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-900 shadow-sm outline-none transition focus:border-[#4a6fe6]/50 focus:ring-2 focus:ring-[#4a6fe6]/15'

export function DisputeResolverPanel({ packRows }: DisputeResolverPanelProps) {
  const [paymentRef, setPaymentRef] = useState('')
  const [reason, setReason] = useState<DisputeReason>(evidenceCopy.dispute.reasons[0])
  const [packId, setPackId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const effectivePackId = packId || packRows[0]?.packId || ''

  const handleGenerate = async () => {
    if (!effectivePackId) {
      setMessage('Select an evidence pack first.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const full = await getEvidencePackFull(effectivePackId)
      if (!full) {
        setMessage('Could not load evidence pack.')
        return
      }
      const bundle = {
        generated_at: new Date().toISOString(),
        payment_reference: paymentRef || full.intent_id,
        dispute_reason: reason,
        evidence_pack_id: full.evidence_pack_id,
        proof_root: full.merkle_root,
        timeline: mapProofTimeline(full),
        missing_proof_checklist: deriveMissingProofChecklist(full),
        pack: full,
      }
      downloadDisputeBundle(bundle, full.evidence_pack_id)
      setMessage('Dispute evidence JSON downloaded. PDF summary requires export API.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${EVIDENCE_CARD} lg:sticky lg:top-4`}>
      <EvidenceSectionHeader title={evidenceCopy.dispute.title} />
      <div className="space-y-4 px-5 pb-5">
        <p className="rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-amber-50/40 px-3 py-2.5 text-[12px] font-medium leading-relaxed text-amber-900">
          {evidenceCopy.dispute.apiBanner}
        </p>
        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            {evidenceCopy.dispute.paymentRef}
          </span>
          <input
            value={paymentRef}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="Payment ref, invoice, or UTR"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            {evidenceCopy.dispute.reason}
          </span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as DisputeReason)}
            className={inputClass}
          >
            {evidenceCopy.dispute.reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            {evidenceCopy.dispute.selectPack}
          </span>
          <select
            value={effectivePackId}
            onChange={(e) => setPackId(e.target.value)}
            className={`${inputClass} font-mono text-[13px]`}
          >
            {packRows.length === 0 ? <option value="">No packs loaded</option> : null}
            {packRows.map((r) => (
              <option key={r.packId} value={r.packId}>
                {r.packId} · {r.intentId}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !effectivePackId}
          onClick={() => void handleGenerate()}
          className="w-full rounded-xl px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(0,35,156,0.25)] transition hover:opacity-95 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#103a9e 0%,#00239c 100%)' }}
        >
          {evidenceCopy.dispute.generate}
        </button>
        {message ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] font-medium text-[#00239C]">
            {message}
          </p>
        ) : null}
        <p className="text-[11px] leading-relaxed text-slate-500">
          Output includes JSON evidence, proof hash, timeline, and missing proof checklist. PDF summary
          pending export API.
        </p>
      </div>
    </section>
  )
}
