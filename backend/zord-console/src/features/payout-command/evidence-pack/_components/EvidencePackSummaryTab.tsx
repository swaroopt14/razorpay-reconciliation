'use client'

import { useEffect, useState } from 'react'
import { evidenceCopy, PROOF_SCORE_TOOLTIP } from '../../evidence/copy/evidenceCopy'
import { mapProofCoverageFromPack } from '../../evidence/mappers/mapProofCoverage'
import { mapProofStatusFromPack } from '../../evidence/mappers/mapProofStatus'
import { computePackProofScore } from '../../evidence/mappers/mapPackTableRow'
import { ProofCoverageSection } from '../../evidence/components/ProofCoverageSection'
import { VerifyProofIntegrityButton } from './VerifyProofIntegrityButton'
import { MissingProofChecklist } from './MissingProofChecklist'
import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { EXPECTED_PROOF_ITEMS } from '../../evidence/types/evidenceViewModels'
import { getIntentJournalPaymentIntentsForSession } from '@/services/payout-command/prod-api/intentJournalApi'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'

type EvidencePackSummaryTabProps = {
  pack: EvidencePackFull | null
  batchId: string
  loading: boolean
}

function cleanDisplay(value: unknown): string | null {
  const out = apiTrimmedString(value)
  if (!out) return null
  const normalized = out.toLowerCase()
  if (normalized === 'null' || normalized === 'undefined') return null
  return out
}

function formatCurrencyLabel(value: number): string {
  return `Rs ${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function parseNumeric(value: unknown): number | null {
  if (value == null || value === '') return null
  const normalized = String(value).replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseCount(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.round(parsed))
}

function formatPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null
  return `${Math.round(value * 10000) / 100}%`
}

function scoreBreakdownHeadline(pack: EvidencePackFull): string | null {
  const components = pack.proof_score_breakdown?.components ?? []
  if (!components.length) return null
  const passed = components.filter((c) => c.passed === true).length
  return `${passed} / ${components.length} checks passed`
}

function resolvePackAmount(pack: EvidencePackFull | null): string | null {
  if (!pack) return null

  const minor = pack.amount_minor
  const minorNum = parseNumeric(minor)
  if (minorNum != null) return formatCurrencyLabel(minorNum / 100)

  const amount = pack.amount
  const amountNum = parseNumeric(amount)
  if (amountNum != null) return formatCurrencyLabel(amountNum)

  return null
}

function resolvePaymentRef(pack: EvidencePackFull): string {
  return (
    cleanDisplay(pack.client_payout_ref) ||
    cleanDisplay(pack.client_reference) ||
    cleanDisplay(pack.intent_id) ||
    cleanDisplay(pack.evidence_pack_id) ||
    '—'
  )
}

export function EvidencePackSummaryTab({ pack, batchId, loading }: EvidencePackSummaryTabProps) {
  const [amountFromIntent, setAmountFromIntent] = useState<string | null>(null)

  useEffect(() => {
    const bid = apiTrimmedString(batchId)
    const iid = apiTrimmedString(pack?.intent_id)
    if (!bid || !iid) {
      setAmountFromIntent(null)
      return
    }

    let cancelled = false
    void getIntentJournalPaymentIntentsForSession(bid).then((res) => {
      if (cancelled) return
      const intent = res.data?.items?.find((row) => apiTrimmedString(row.intent_id) === iid)
      const rawAmount = intent?.amount
      const parsed = parseNumeric(rawAmount)
      if (parsed == null) {
        setAmountFromIntent(null)
        return
      }
      setAmountFromIntent(formatCurrencyLabel(parsed))
    })

    return () => {
      cancelled = true
    }
  }, [batchId, pack?.intent_id])

  if (loading) return <p className="text-[15px] text-[#6f716d]">Loading evidence pack…</p>
  if (!pack) {
    return (
      <div>
        <p className="text-[16px] font-semibold text-[#111111]">{evidenceCopy.empty.noPack}</p>
        <p className="mt-2 text-[15px] text-[#6f716d]">{evidenceCopy.empty.noPackHint}</p>
      </div>
    )
  }

  const status = mapProofStatusFromPack(
    {
      evidence_pack_id: pack.evidence_pack_id,
      tenant_id: pack.tenant_id,
      intent_id: pack.intent_id,
      contract_id: pack.contract_id,
      mode: pack.mode,
      pack_status: pack.pack_status,
      merkle_root: pack.merkle_root,
      ruleset_version: pack.ruleset_version,
      created_at: pack.created_at,
      proof_status: pack.proof_status,
      proof_score: pack.proof_score,
      leaf_count: pack.leaf_count,
      required_leaf_count: pack.required_leaf_count,
      artifact_count: pack.items?.length,
      verification_status: pack.verification_status,
      settlement_leaf_present_flag: pack.settlement_leaf_present_flag,
      attachment_decision_leaf_present_flag: pack.attachment_decision_leaf_present_flag,
      proof_components: pack.proof_components,
    },
    pack.leaf_count ?? pack.items?.length,
  )
  const score =
    pack.proof_score != null ? Math.round(Number(pack.proof_score)) : computePackProofScore(pack.items?.length)
  const coverage = mapProofCoverageFromPack(pack)
  const paymentRef = resolvePaymentRef(pack)
  const amountLabel = resolvePackAmount(pack) ?? amountFromIntent
  const confidenceLabel = formatPercent(pack.match_confidence)
  const breakdownHeadline = scoreBreakdownHeadline(pack)
  const governanceLabel = cleanDisplay(pack.governance_decision)
  const attachmentLabel = cleanDisplay(pack.attachment_decision)
  const bankRefLabel = cleanDisplay(pack.bank_reference)
  const amountMatchLabel =
    typeof pack.amount_match === 'boolean' ? (pack.amount_match ? 'Pass' : 'Fail') : null
  const valueDateLabel =
    typeof pack.value_date_check === 'boolean' ? (pack.value_date_check ? 'Pass' : 'Fail') : null
  const leafSeen = parseCount(pack.leaf_count) ?? parseCount(pack.items?.length)
  const requiredLeaves = parseCount(pack.required_leaf_count)
  const leafTotal =
    leafSeen != null && requiredLeaves != null
      ? Math.max(leafSeen, requiredLeaves)
      : requiredLeaves ?? leafSeen ?? EXPECTED_PROOF_ITEMS
  const leafDisplay = leafSeen ?? 0
  const summaryCards: Array<{ label: string; value: string; mono?: boolean; hint?: string }> = [
    { label: 'Payment Ref', value: paymentRef, mono: true },
    { label: 'Evidence Pack ID', value: pack.evidence_pack_id, mono: true },
    { label: 'Proof status', value: status.label },
    {
      label: 'Proof score',
      value: score != null ? `${score} / 100` : '—',
      hint: breakdownHeadline ? `${PROOF_SCORE_TOOLTIP} ${breakdownHeadline}.` : PROOF_SCORE_TOOLTIP,
    },
    { label: 'Match confidence', value: confidenceLabel ?? '—' },
    { label: 'Governance decision', value: governanceLabel ?? '—' },
    { label: 'Attachment decision', value: attachmentLabel ?? '—' },
    { label: 'Bank reference', value: bankRefLabel ?? '—', mono: true },
    { label: 'Amount check', value: amountMatchLabel ?? '—' },
    { label: 'Value-date check', value: valueDateLabel ?? '—' },
    ...(amountLabel ? [{ label: 'Amount', value: amountLabel }] : []),
    { label: 'Beneficiary', value: '•••••• (masked)', hint: 'Full beneficiary controlled by access policy' },
    { label: 'Final status', value: pack.pack_status },
  ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summaryCards.map((card) => (
          <SummaryField
            key={card.label}
            label={card.label}
            value={card.value}
            mono={card.mono}
            hint={card.hint}
          />
        ))}
      </div>
      <ProofCoverageSection tiles={coverage} />
      <MissingProofChecklist pack={pack} />
      <VerifyProofIntegrityButton pack={pack} />
      <p className="text-[12px] text-[#94a3b8]">
        Proof items: {leafDisplay} / {leafTotal} available
      </p>
    </div>
  )
}

function SummaryField({
  label,
  value,
  mono,
  hint,
}: {
  label: string
  value: string
  mono?: boolean
  hint?: string
}) {
  return (
    <div className="rounded-[12px] border border-[#E5E5E5] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
      <p className={`mt-1 text-[16px] font-semibold text-[#111111] ${mono ? 'font-mono text-[14px]' : ''}`}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-[12px] leading-relaxed text-[#6f716d]">{hint}</p> : null}
    </div>
  )
}
